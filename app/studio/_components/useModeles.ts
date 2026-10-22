"use client";

import { useCallback, useEffect, useState } from "react";

import { toastErreur } from "@/lib/toast";
import type { AgregatModele } from "@/lib/studioAgregats";
import type { EtatCatalogue } from "@/lib/studioCatalogue";
import type { BudgetCompte, ModeleImage } from "@/lib/studioModeles";

import { lireErreur } from "./envoi";

/**
 * The catalogue as the screen sees it. `source: "navigateur"`: the server had
 * nothing (OpenRouter down since its last start), so the last catalogue THIS
 * browser received is shown, with its date. The server re-checks every model
 * and price before paying: this copy only lets Aramis read and choose.
 */
export type CatalogueClient = { modeles: ModeleImage[]; etat: EtatCatalogue; fetchedAt: string | null; source: "serveur" | "navigateur" };

/** What the sheet shares with the picker, the quote and the judging step. */
export type ContexteModeles = {
  /** null while the catalogue has not arrived (or could not be read at all). */
  catalogue: CatalogueClient | null;
  /** Aramis's real results per model (GET /api/studio/modeles). A model never used has none. */
  agregats: AgregatModele[];
  /** Budget per bag and rate of the ACCOUNT (the server compares the same ones). */
  budget: BudgetCompte;
  chargement: boolean;
  erreur: string | null;
  /** Reads again; `force` asks the server to re-read OpenRouter now (« Rafraîchir »). */
  recharger: (force?: boolean) => void;
  favoris: string[];
  /** Favourites being saved: their star waits for the answer. */
  favorisEnCours: string[];
  basculerFavori: (id: string) => void;
  /** The budget was saved (settings popover): the quote follows at once. */
  majBudget: (b: BudgetCompte) => void;
};

type ReponseModeles = {
  modeles?: unknown;
  favoris?: unknown;
  agregats?: unknown;
  budget?: unknown;
  etat?: EtatCatalogue;
  fetchedAt?: unknown;
};

const CLE_MEMOIRE = "myflip-studio-catalogue";

function lireMemoire(): { modeles: ModeleImage[]; fetchedAt: string } | null {
  try {
    const brut = window.localStorage.getItem(CLE_MEMOIRE);
    if (!brut) return null;
    const j = JSON.parse(brut) as { modeles?: unknown; fetchedAt?: unknown };
    if (!Array.isArray(j.modeles) || j.modeles.length === 0 || typeof j.fetchedAt !== "string") return null;
    return { modeles: j.modeles as ModeleImage[], fetchedAt: j.fetchedAt };
  } catch {
    return null;
  }
}

function ecrireMemoire(modeles: ModeleImage[], fetchedAt: string | null) {
  try {
    window.localStorage.setItem(CLE_MEMOIRE, JSON.stringify({ modeles, fetchedAt: fetchedAt ?? new Date().toISOString() }));
  } catch {
    // Storage unavailable: the server's own fallback still applies.
  }
}

function lireBudget(v: unknown, repli: BudgetCompte): BudgetCompte {
  if (typeof v !== "object" || v === null) return repli;
  const b = v as Partial<BudgetCompte>;
  const ok = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
  return ok(b.budgetParSacEur) && ok(b.tauxEurParUsd) ? { budgetParSacEur: b.budgetParSacEur, tauxEurParUsd: b.tauxEurParUsd } : repli;
}

/**
 * Catalogue, favourites, real results and budget: loaded ONCE for the sheet.
 * Never a price from nowhere: when the server has no catalogue, the last one
 * this browser saw is shown AS SUCH (date and source), or nothing.
 */
export function useModeles(budgetInitial: BudgetCompte): ContexteModeles {
  const [catalogue, setCatalogue] = useState<CatalogueClient | null>(null);
  const [agregats, setAgregats] = useState<AgregatModele[]>([]);
  const [budget, setBudget] = useState<BudgetCompte>(budgetInitial);
  const [favoris, setFavoris] = useState<string[]>([]);
  const [favorisEnCours, setFavorisEnCours] = useState<string[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const repliNavigateur = useCallback((): CatalogueClient | null => {
    const m = lireMemoire();
    return m ? { modeles: m.modeles, etat: { kind: "stale", fetchedAt: m.fetchedAt }, fetchedAt: m.fetchedAt, source: "navigateur" } : null;
  }, []);

  const charger = useCallback(
    async (signal?: AbortSignal, force = false) => {
      setChargement(true);
      setErreur(null);
      try {
        const res = await fetch(`/api/studio/modeles${force ? "?rafraichir=1" : ""}`, { signal, cache: "no-store" });
        if (!res.ok) throw new Error(await lireErreur(res));
        const j = (await res.json()) as ReponseModeles;
        if (!Array.isArray(j.modeles)) throw new Error("réponse illisible");
        const modeles = j.modeles as ModeleImage[];
        const etat = j.etat ?? { kind: "live" };
        const fetchedAt = typeof j.fetchedAt === "string" ? j.fetchedAt : null;
        if (modeles.length > 0) {
          setCatalogue({ modeles, etat, fetchedAt, source: "serveur" });
          if (etat.kind === "live") ecrireMemoire(modeles, fetchedAt);
        } else {
          // The server has nothing (OpenRouter down since its start): this browser's last copy, labelled as such.
          setCatalogue(repliNavigateur() ?? { modeles: [], etat, fetchedAt, source: "serveur" });
        }
        setFavoris(Array.isArray(j.favoris) ? j.favoris.filter((x): x is string => typeof x === "string") : []);
        setAgregats(Array.isArray(j.agregats) ? (j.agregats as AgregatModele[]) : []);
        setBudget((b) => lireBudget(j.budget, b));
      } catch (e) {
        if (signal?.aborted) return;
        setErreur(e instanceof Error ? e.message : "erreur inconnue");
        setCatalogue((c) => c ?? repliNavigateur());
      } finally {
        if (!signal?.aborted) setChargement(false);
      }
    },
    [repliNavigateur],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    void charger(ctrl.signal);
    return () => ctrl.abort();
  }, [charger]);

  async function basculerFavori(id: string) {
    if (favorisEnCours.includes(id)) return;
    const ajout = !favoris.includes(id);
    setFavoris((f) => (ajout ? [...f, id] : f.filter((x) => x !== id)));
    setFavorisEnCours((f) => [...f, id]);
    try {
      const res = await fetch("/api/studio/modeles/favoris", {
        method: ajout ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modele: id }),
      });
      if (!res.ok) throw new Error(await lireErreur(res));
    } catch (e) {
      // Back to the previous state: the star never lies about what is saved.
      setFavoris((f) => (ajout ? f.filter((x) => x !== id) : [...f, id]));
      toastErreur(`Favori non enregistré : ${e instanceof Error ? e.message : "erreur inconnue"}`);
    } finally {
      setFavorisEnCours((f) => f.filter((x) => x !== id));
    }
  }

  return {
    catalogue,
    agregats,
    budget,
    chargement,
    erreur,
    recharger: (force = false) => void charger(undefined, force),
    favoris,
    favorisEnCours,
    basculerFavori: (id) => void basculerFavori(id),
    majBudget: setBudget,
  };
}
