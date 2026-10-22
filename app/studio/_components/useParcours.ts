"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { toastAnnulable, toastErreur, toastSucces } from "@/lib/toast";
import { choixAutomatique, cleCase, type EtatCase } from "@/lib/studioCases";

import { DecisionsDifferees, type Decision } from "../_decisions";
import { lireErreur } from "./envoi";
import { demanderAvis } from "./lancer";
import type { EssaiClient, FicheClient } from "./Fiche";

// The three pieces of state the sheet's sections share: the cells picked for
// the target bag (Angles ↔ Génération), the AI opinions in flight or failed
// (À juger), and the deferred decisions (À juger ↔ Validées, cells, counts).

// ── Cells picked for the target bag ─────────────────────────────────────────

export type Choix = { referenceId: string; angleId: string; ordre: number };

export function useChoixCases(fiche: FicheClient, cible: string | null) {
  const { lignes, angles, cases, essais } = fiche;
  const etats = useMemo(() => new Map(Object.entries(cases)) as Map<string, EtatCase>, [cases]);
  const auto = useMemo(() => choixAutomatique(lignes, angles, etats, essais, cible), [lignes, angles, etats, essais, cible]);
  // null = automatic choice; otherwise Aramis's choices, row by row.
  const [manuels, setManuels] = useState<Record<string, string | null> | null>(null);
  useEffect(() => setManuels(null), [cible]);

  const choixDe = (refId: string) => (manuels && refId in manuels ? manuels[refId] : auto.get(refId) ?? null);
  const choisies: Choix[] = lignes.flatMap((l) => {
    const a = choixDe(l.id);
    return a && etats.get(cleCase(l.id, a))?.kind === "libre" ? [{ referenceId: l.id, angleId: a, ordre: l.ordre }] : [];
  });

  // Counts for the target bag: one image per photo and per listing.
  const pourCible = essais.filter((e) => cible && e.skuCible === cible && e.decision !== "rejete");
  const couvertes = new Set(pourCible.map((e) => e.referenceId));
  return {
    etats,
    choisies,
    choixDe,
    estManuel: manuels !== null,
    basculer: (refId: string, angleId: string) =>
      setManuels((m) => ({ ...(m ?? {}), [refId]: choixDe(refId) === angleId ? null : angleId })),
    automatique: () => setManuels(null),
    toutDecocher: () => setManuels(Object.fromEntries(lignes.map((l) => [l.id, null]))),
    pretes: new Set(pourCible.filter((e) => e.decision === "valide").map((e) => e.referenceId)).size,
    aJugerPourCible: new Set(pourCible.filter((e) => e.decision === null).map((e) => e.referenceId)).size,
    sansImage: lignes.filter((l) => !couvertes.has(l.id)).length,
  };
}

export type ChoixCases = ReturnType<typeof useChoixCases>;

// ── AI opinions: one at a time, in arrival order, never on page load ────────

export function useAvisIA() {
  const router = useRouter();
  const [enCours, setEnCours] = useState<ReadonlySet<string>>(new Set());
  const [echecs, setEchecs] = useState<ReadonlyMap<string, string>>(new Map());
  const file = useRef<string[]>([]);
  const enMarche = useRef(false);

  async function pomper() {
    if (enMarche.current) return;
    enMarche.current = true;
    let ranges = 0;
    while (file.current.length > 0) {
      const id = file.current.shift()!;
      setEnCours((s) => new Set(s).add(id));
      const r = await demanderAvis(id, () => router.push("/compte"));
      setEchecs((m) => {
        const n = new Map(m);
        if (r.ok) n.delete(id);
        else n.set(id, r.message);
        return n;
      });
      if (r.ok) ranges++;
      setEnCours((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
    enMarche.current = false;
    // One server re-read once the queue is empty, not one per opinion.
    if (ranges > 0) router.refresh();
  }

  return {
    enCours,
    echecs,
    demander: (ids: readonly string[]) => {
      file.current.push(...ids.filter((id) => !file.current.includes(id) && !enCours.has(id)));
      void pomper();
    },
  };
}

export type AvisIA = ReturnType<typeof useAvisIA>;

// ── Deferred decisions ──────────────────────────────────────────────────────

/** null = recorded; otherwise the server's reason (409 case_reprise, deja_validee, image_purgee…). */
async function envoyerDecision(essaiId: string, decision: Decision | null, { urgent }: { urgent: boolean }): Promise<string | null> {
  try {
    const res = await fetch(`/api/studio/essais/${essaiId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
      // The page is closing: the browser finishes the request on its own.
      keepalive: urgent,
    });
    return res.ok ? null : await lireErreur(res);
  } catch {
    return "connexion perdue";
  }
}

const horlogeNavigateur = {
  poser: (fn: () => void, ms: number) => window.setTimeout(fn, ms),
  annuler: (jeton: unknown) => window.clearTimeout(jeton as number),
};

/**
 * V / R: the image leaves the queue at once, a toast offers « Annuler » for
 * 5 s, and only then does the decision reach the server. Leaving the page
 * sends what is still waiting (keepalive): a decision is never lost, and an
 * undone one is never sent.
 */
export function useDecisions(fiche: FicheClient, onRetour: (essaiId: string) => void) {
  const router = useRouter();
  const [, rendre] = useReducer((n: number) => n + 1, 0);
  const minuteurRefresh = useRef<number | null>(null);
  const retour = useRef(onRetour);
  retour.current = onRetour;

  const relire = () => {
    if (minuteurRefresh.current) window.clearTimeout(minuteurRefresh.current);
    minuteurRefresh.current = window.setTimeout(() => router.refresh(), 400);
  };

  const ref = useRef<DecisionsDifferees | null>(null);
  if (!ref.current) {
    ref.current = new DecisionsDifferees(envoyerDecision, horlogeNavigateur, {
      onChange: rendre,
      onEnvoye: (id, d) => {
        if (d === null) {
          toastSucces("Décision annulée : l’image revient dans la file.");
          retour.current(id);
        }
        relire();
      },
      onErreur: (id, d, motif) => {
        const raison = /[.!?…]$/.test(motif.trim()) ? motif.trim() : `${motif.trim()}.`;
        toastErreur(
          d === null
            ? `Annulation refusée : ${raison} La décision reste.`
            : `Décision non enregistrée : ${raison} L’image revient dans la file.`,
        );
        if (d !== null) retour.current(id);
        relire();
      },
    });
  }
  const decisions = ref.current;

  useEffect(() => {
    decisions.synchroniser((id) => {
      const e = fiche.essais.find((x) => x.id === id);
      return e ? e.decision : undefined;
    });
  }, [fiche.essais, decisions]);

  useEffect(() => {
    const vider = () => decisions.vider();
    window.addEventListener("pagehide", vider);
    return () => {
      window.removeEventListener("pagehide", vider);
      vider();
    };
  }, [decisions]);

  function decider(e: EssaiClient, decision: Decision) {
    decisions.decider(e.id, decision);
    const message =
      decision === "rejete" ? "Image rejetée" : e.skuCible ? `Validée pour ${e.skuCible}` : "Validée, sans annonce";
    toastAnnulable(message, {
      onAnnuler: () => {
        if (decisions.annuler(e.id) === "rien_envoye") retour.current(e.id);
      },
    });
  }

  /**
   * Several decisions at once (a comparison: keep one, reject the others), one
   * toast: « Annuler » takes them all back. Each still leaves after the delay.
   */
  function deciderPlusieurs(liste: readonly { essai: EssaiClient; decision: Decision }[], message: string) {
    if (liste.length === 0) return;
    for (const { essai, decision } of liste) decisions.decider(essai.id, decision);
    toastAnnulable(message, {
      onAnnuler: () => {
        const resultats = liste.map(({ essai }) => decisions.annuler(essai.id));
        if (resultats.includes("rien_envoye")) retour.current(liste[0].essai.id);
      },
    });
  }

  return { masquees: decisions.masquees(), decider, deciderPlusieurs, decisionDe: (id: string) => decisions.decisionDe(id) };
}

export type Decisions = ReturnType<typeof useDecisions>;
