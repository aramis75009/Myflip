"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleAlert, Clock, GitCompareArrows, ImageOff, RotateCcw, Undo2, Wrench } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { cn } from "@/lib/cn";
import { pluriel } from "@/lib/format";
import { toastErreur, toastSucces } from "@/lib/toast";
import { MODELE_MANUEL } from "@/lib/studioFiche";
import type { Tentative, TentativeEssai } from "@/lib/studioHistorique";
import { formatEur, formatUsd, usdEnEur } from "@/lib/studioModeles";

import { libelleDuree, planRetenir } from "../_comparaison";
import { lireErreur } from "./envoi";

export type CibleHistorique = { referenceId: string; angleId: string; titre: string };

const quand = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).replace(" ", " à ");

const SUGGESTION: Record<string, string> = { ok: "valider", a_corriger: "corriger", rejet: "rejeter" };

/** null = recorded; otherwise the server's reason. */
async function patcher(id: string, decision: "valide" | "rejete" | null): Promise<string | null> {
  try {
    const res = await fetch(`/api/studio/essais/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    return res.ok ? null : await lireErreur(res);
  } catch {
    return "connexion perdue";
  }
}

/**
 * Every attempt of one cell (real photo × angle prompt), the most recent
 * first: rejected images and failures included, with model, cost (real,
 * estimated or unknown — never zero), duration, AI opinion and Aramis's
 * decision. « Retenir cette version » rejects the image holding the cell, then
 * validates this one (two calls, in that order); « Annuler la décision » puts
 * an image back to judge when the server allows it, and says why not otherwise.
 */
export default function HistoriquePrise({
  cle,
  cible,
  onFermer,
  nomDe,
  taux,
  onModifie,
}: {
  cle: string;
  cible: CibleHistorique | null;
  onFermer: () => void;
  nomDe: (id: string) => string;
  taux: number;
  /** A decision changed: the sheet re-reads the server. */
  onModifie: () => void;
}) {
  const [tentatives, setTentatives] = useState<Tentative[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState<string | null>(null);

  const charger = useCallback(async () => {
    if (!cible) return;
    setErreur(null);
    try {
      const q = new URLSearchParams({ cle, referenceId: cible.referenceId, angleId: cible.angleId });
      const res = await fetch(`/api/studio/historique?${q}`, { cache: "no-store" });
      if (!res.ok) throw new Error(await lireErreur(res));
      const j = (await res.json()) as { tentatives?: unknown };
      if (!Array.isArray(j.tentatives)) throw new Error("réponse illisible");
      setTentatives(j.tentatives as Tentative[]);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "erreur inconnue");
    }
  }, [cle, cible]);

  useEffect(() => {
    setTentatives(null);
    void charger();
  }, [charger]);

  async function retenir(id: string) {
    if (!tentatives || occupe) return;
    const plan = planRetenir(tentatives, id);
    if (!plan.ok) {
      toastErreur(plan.message);
      return;
    }
    setOccupe(id);
    const avant = new Map(tentatives.filter((t): t is TentativeEssai => t.kind === "essai").map((t) => [t.id, t.decision]));
    const rejetes: string[] = [];
    let refus: string | null = null;
    // 1. Free the cell: the image(s) holding it are rejected first.
    for (const autre of plan.rejeter) {
      refus = await patcher(autre, "rejete");
      if (refus) break;
      rejetes.push(autre);
    }
    // 2. Then this one is validated.
    if (!refus) refus = await patcher(plan.valider, "valide");
    if (refus) {
      // Never leave the cell freed for nothing: what was rejected goes back.
      for (const autre of rejetes) await patcher(autre, avant.get(autre) ?? null);
      toastErreur(`Version non retenue : ${refus}`);
    } else {
      toastSucces(
        plan.rejeter.length > 0
          ? `Version retenue · ${pluriel(plan.rejeter.length, "autre image rejetée", "autres images rejetées")}.`
          : "Version retenue.",
      );
    }
    setOccupe(null);
    await charger();
    onModifie();
  }

  async function annuler(id: string) {
    if (occupe) return;
    setOccupe(id);
    const refus = await patcher(id, null);
    if (refus) toastErreur(`Annulation refusée : ${refus}`);
    else toastSucces("Décision annulée : l’image revient dans la file « À juger ».");
    setOccupe(null);
    await charger();
    onModifie();
  }

  const recentes = tentatives ? [...tentatives].reverse() : null;
  const parLancement = new Map<string, number>();
  for (const t of tentatives ?? []) if (t.kind === "essai" && t.lancementId) parLancement.set(t.lancementId, (parLancement.get(t.lancementId) ?? 0) + 1);

  return (
    <Sheet
      side="droite"
      open={cible !== null}
      onOpenChange={(o) => !o && onFermer()}
      title="Historique de la prise"
      description={cible?.titre}
      pending={occupe !== null}
    >
      {erreur ? (
        <ErrorState titre="Historique illisible." detail={erreur} onRetry={() => void charger()} />
      ) : !recentes ? (
        <div aria-busy="true" className="flex flex-col gap-3">
          <span className="sr-only">Chargement de l’historique…</span>
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : recentes.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-2">Aucune tentative sur cette prise pour l’instant.</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-ink-2">
            {pluriel(recentes.length, "tentative", "tentatives")}, la plus récente en premier. Seules tes décisions comptent dans les taux ; l’avis
            de l’IA n’est qu’une aide.
          </p>
          <ol className="flex flex-col gap-3">
            {recentes.map((t) =>
              t.kind === "echec" ? (
                <li key={t.id} className="flex gap-3 rounded-md border border-line p-3">
                  <span className="grid h-20 w-16 flex-none place-items-center rounded-sm bg-neg-soft text-neg">
                    <CircleAlert size={20} aria-hidden />
                  </span>
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold text-ink">Échec · {nomDe(t.modele)}</p>
                    <p className="text-xs text-ink-2">
                      {quand(t.creeLe)}
                      {libelleDuree(t.dureeMs) ? ` · ${libelleDuree(t.dureeMs)}` : ""} · {texteCout(t.cout, taux)}
                    </p>
                    <p className="mt-1 text-ink-2">{t.message}</p>
                    <Badge ton="neg" className="mt-1.5">
                      {t.code}
                    </Badge>
                  </div>
                </li>
              ) : (
                <ItemEssai
                  key={t.id}
                  t={t}
                  nomDe={nomDe}
                  taux={taux}
                  compare={t.lancementId ? (parLancement.get(t.lancementId) ?? 0) > 1 : false}
                  occupe={occupe}
                  onRetenir={() => void retenir(t.id)}
                  onAnnuler={() => void annuler(t.id)}
                  peutRetenir={tentatives ? planRetenir(tentatives, t.id) : null}
                />
              ),
            )}
          </ol>
        </>
      )}
    </Sheet>
  );
}

function texteCout(c: Tentative["cout"], taux: number): string {
  if (c.nature === "inconnu" || c.usd === null) return "coût inconnu";
  const eur = usdEnEur(c.usd, taux);
  const montant = eur === null ? formatUsd(c.usd) : formatEur(eur);
  return c.nature === "reel" ? `${montant} réel` : `≈ ${montant} estimé`;
}

function ItemEssai({
  t,
  nomDe,
  taux,
  compare,
  occupe,
  peutRetenir,
  onRetenir,
  onAnnuler,
}: {
  t: TentativeEssai;
  nomDe: (id: string) => string;
  taux: number;
  compare: boolean;
  occupe: string | null;
  peutRetenir: ReturnType<typeof planRetenir> | null;
  onRetenir: () => void;
  onAnnuler: () => void;
}) {
  const manuel = t.modele === MODELE_MANUEL;
  const decision =
    t.decision === "valide" ? (
      <Badge ton="pos">Validée{t.skuCible ? ` · ${t.skuCible}` : ""}</Badge>
    ) : t.decision === "rejete" ? (
      <Badge ton="neg">Rejetée</Badge>
    ) : (
      <Badge>À juger</Badge>
    );
  return (
    <li className={cn("flex gap-3 rounded-md border p-3", t.decision === "valide" ? "border-pos" : "border-line")}>
      {t.image ? (
        // eslint-disable-next-line @next/next/no-img-element -- image privée servie par /api/studio/image
        <img src={t.image} alt={`Essai n° ${t.numero}, ${manuel ? "dépôt manuel" : nomDe(t.modele)}`} loading="lazy" className="h-20 w-16 flex-none rounded-sm border border-line bg-surface-2 object-cover" />
      ) : (
        <span className="flex h-20 w-16 flex-none flex-col items-center justify-center gap-1 rounded-sm bg-surface-2 px-1 text-center text-xs text-ink-3">
          <ImageOff size={16} aria-hidden /> Purgée
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold text-ink">{manuel ? "Dépôt manuel (Gemini)" : nomDe(t.modele)}</span>
          <span className="font-mono text-xs text-ink-3">n° {t.numero}</span>
          {decision}
        </p>
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-ink-2">
          <span>{quand(t.creeLe)}</span>
          {libelleDuree(t.dureeMs) && (
            <span className="inline-flex items-center gap-1">
              <Clock size={12} aria-hidden /> {libelleDuree(t.dureeMs)}
            </span>
          )}
          <span className="font-mono tabular-nums">{manuel ? "sans coût API" : texteCout(t.cout, taux)}</span>
        </p>
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-ink-2">
          {t.verdictIA ? (
            <span>
              L’IA suggère <strong className="font-semibold text-ink">{SUGGESTION[t.verdictIA.verdict] ?? t.verdictIA.verdict}</strong> ·{" "}
              <span className="font-mono">{t.verdictIA.scoreGlobal}/100</span>
            </span>
          ) : (
            <span>Pas d’avis IA</span>
          )}
          {compare && (
            <span className="inline-flex items-center gap-1">
              <GitCompareArrows size={12} aria-hidden /> comparaison
            </span>
          )}
          {t.essaiParentId && (
            <span className="inline-flex items-center gap-1">
              <Wrench size={12} aria-hidden /> correction
            </span>
          )}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {peutRetenir?.ok && (
            <Button size="sm" pending={occupe === t.id} pendingLabel="…" disabled={occupe !== null && occupe !== t.id} onClick={onRetenir}>
              <RotateCcw size={14} aria-hidden /> Retenir cette version
            </Button>
          )}
          {t.decision !== null &&
            (t.peutAnnuler.possible ? (
              <Button variant="secondary" size="sm" disabled={occupe !== null} onClick={onAnnuler}>
                <Undo2 size={14} aria-hidden /> Annuler la décision
              </Button>
            ) : (
              <span className="text-xs text-ink-3">{t.peutAnnuler.message}</span>
            ))}
        </div>
      </div>
    </li>
  );
}
