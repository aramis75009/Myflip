"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { ModeleImage } from "@/lib/studioModeles";
import { lireErreur } from "./envoi";
import type { CatalogueClient, ContexteModeles } from "./SelecteurModeles";

/** GET /api/studio/modeles, lu défensivement : la route est la seule source du catalogue. */
type ReponseModeles = { modeles?: unknown; favoris?: unknown; etat?: CatalogueClient["etat"]; fetchedAt?: unknown };

/**
 * Catalogue des modèles d'image et favoris : chargés UNE fois pour la fiche,
 * partagés par toutes les lignes d'angle (une étoile posée sur un angle vaut
 * pour tous).
 */
export function useModeles(): ContexteModeles {
  const [catalogue, setCatalogue] = useState<CatalogueClient | null>(null);
  const [favoris, setFavoris] = useState<string[]>([]);
  const [favorisEnCours, setFavorisEnCours] = useState<string[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async (signal?: AbortSignal) => {
    setChargement(true);
    setErreur(null);
    try {
      const res = await fetch("/api/studio/modeles", { signal, cache: "no-store" });
      if (!res.ok) throw new Error(await lireErreur(res));
      const j = (await res.json()) as ReponseModeles;
      if (!Array.isArray(j.modeles)) throw new Error("réponse illisible");
      setCatalogue({
        modeles: j.modeles as ModeleImage[],
        etat: j.etat ?? { kind: "live" },
        fetchedAt: typeof j.fetchedAt === "string" ? j.fetchedAt : null,
      });
      setFavoris(Array.isArray(j.favoris) ? j.favoris.filter((x): x is string => typeof x === "string") : []);
    } catch (e) {
      if (signal?.aborted) return;
      setErreur(e instanceof Error ? e.message : "erreur inconnue");
    } finally {
      if (!signal?.aborted) setChargement(false);
    }
  }, []);

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
      // Retour à l'état d'avant : l'étoile ne ment pas sur ce qui est en base.
      setFavoris((f) => (ajout ? f.filter((x) => x !== id) : [...f, id]));
      toast.error(`Favori non enregistré : ${e instanceof Error ? e.message : "erreur inconnue"}`);
    } finally {
      setFavorisEnCours((f) => f.filter((x) => x !== id));
    }
  }

  return {
    catalogue,
    chargement,
    erreur,
    recharger: () => void charger(),
    favoris,
    favorisEnCours,
    basculerFavori: (id) => void basculerFavori(id),
  };
}
