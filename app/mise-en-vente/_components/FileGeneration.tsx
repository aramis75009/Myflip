"use client";

// Étape 3 : la file de génération.
//
// ── Pipeline ──────────────────────────────────────────────────────────────
//
//   fiche 1 ─▶ compression ─▶ POST /api/listings/generate ─▶ ok | erreur
//                                       │
//   fiche 2 ─────────── attend ─────────┘  (SÉQUENTIEL, jamais en parallèle)
//   fiche 3 ─────────── attend
//
// Séquentiel par choix : l'endpoint reste inchangé, le prompt aussi, et un
// envoi groupé de 15 images frôlerait la limite de corps de Vercel. Le prix à
// payer est l'attente cumulée ; le bénéfice est qu'un échec sur la fiche 3 ne
// coûte que la fiche 3.

import { AlertTriangle, Check, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { progression, type ArticleEnCours } from "../_reducer";
import { cardCls } from "../_ui";

type Props = {
  fiches: ArticleEnCours[];
  enCours: boolean;
  onRelancer: (id: string) => void;
  onRetour: () => void;
  onVoirResultats: () => void;
};

export default function FileGeneration({
  fiches,
  enCours,
  onRelancer,
  onRetour,
  onVoirResultats,
}: Props) {
  const { faites, total, erreurs } = progression(fiches);
  const termine = !enCours;
  const pct = total > 0 ? Math.round((faites / total) * 100) : 0;

  return (
    <div className={`${cardCls} px-6 py-10 motion-safe:animate-entree`}>
      <div className="mx-auto max-w-[520px]">
        <h2 className="text-center font-sans text-lg font-bold tracking-[-0.02em]">
          {termine
            ? erreurs > 0
              ? `${faites} annonce${faites > 1 ? "s" : ""} sur ${total}`
              : "Annonces générées"
            : "Génération en cours…"}
        </h2>
        <p className="mt-2 text-center text-base font-medium text-ink-3">
          {termine
            ? erreurs > 0
              ? "Relance celles qui ont échoué, ou continue sans elles."
              : "Relis, ajuste, puis choisis le statut de chaque article."
            : "MyFlip rédige tes annonces une par une."}
        </p>

        <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-slow ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-1.5 text-center font-mono text-xs uppercase tracking-[0.1em] text-ink-3">
          {faites} / {total}
        </p>

        <ul className="mt-6 flex flex-col gap-2">
          {fiches.map((f) => {
            const g = f.generation;
            return (
              <li
                key={f.id}
                className="flex items-center gap-3 rounded-md border border-line bg-surface-2 px-4 py-3"
              >
                <span className="flex h-6 w-6 flex-none items-center justify-center">
                  {g.phase === "encours" && (
                    <Loader2 className="h-[17px] w-[17px] motion-safe:animate-spin text-accent-text" />
                  )}
                  {g.phase === "ok" && (
                    <Check className="h-[17px] w-[17px] text-pos" strokeWidth={2.6} />
                  )}
                  {g.phase === "erreur" && (
                    <AlertTriangle className="h-[17px] w-[17px] text-neg" />
                  )}
                  {(g.phase === "prete" || g.phase === "vide") && (
                    <span className="h-2 w-2 rounded-full bg-line-strong" />
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-sm font-bold text-ink">
                    {f.sku.trim() || "—"}
                  </span>
                  <span className="block truncate text-xs text-ink-3">
                    {g.phase === "ok"
                      ? g.resultat.titre
                      : g.phase === "erreur"
                        ? g.message
                        : g.phase === "encours"
                          ? "rédaction…"
                          : "en attente"}
                  </span>
                </span>

                {g.phase === "erreur" && !enCours && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onRelancer(f.id)}
                    className="flex-none"
                  >
                    <RefreshCw aria-hidden className="h-3.5 w-3.5" strokeWidth={2.2} />
                    Relancer
                  </Button>
                )}
              </li>
            );
          })}
        </ul>

        {termine && (
          <div className="mt-7 flex flex-wrap justify-center gap-2.5">
            <Button variant="secondary" size="lg" onClick={onRetour}>
              Revenir aux fiches
            </Button>
            {faites > 0 && (
              <Button size="lg" onClick={onVoirResultats}>
                Voir les annonces
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
