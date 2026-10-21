"use client";
// design-tokens-dette: R13 → M3

// Étape 1 : les SKU de la session, saisis d'un bloc.
//
// Les cinq recherches partent ensemble, avant la séance photo. Un SKU
// introuvable se découvre donc AVANT d'avoir photographié quoi que ce soit —
// c'est tout l'intérêt de saisir en premier plutôt qu'au fil de l'eau.

import { AlertTriangle, Check, Loader2, Plus, X } from "lucide-react";
import StatutBadge from "@/components/StatutBadge";
import { MAX_FICHES, skuEnDoublon, type ArticleEnCours } from "../_reducer";
import { cardCls, labelCls } from "../_ui";

type Props = {
  fiches: ArticleEnCours[];
  onSaisie: (id: string, sku: string) => void;
  onChercher: (id: string) => void;
  onAjout: () => void;
  onRetrait: (id: string) => void;
};

export default function EtapeSku({
  fiches,
  onSaisie,
  onChercher,
  onAjout,
  onRetrait,
}: Props) {
  const doublons = skuEnDoublon(fiches);

  return (
    <div className="flex flex-col gap-[18px] motion-safe:animate-entree">
      <div className={`${cardCls} p-5 md:p-6`}>
        <label className={labelCls}>SKU des articles de la session</label>
        <p className="mt-1.5 text-sm font-medium text-ink-3">
          Jusqu&apos;à {MAX_FICHES} articles. Entrée valide et passe au suivant.
        </p>

        <div className="mt-4 flex flex-col gap-2.5">
          {fiches.map((f, i) => {
            const doublon = doublons.has(f.sku.trim().toUpperCase());
            return (
              <div key={f.id} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2.5">
                  <span className="w-5 flex-none font-mono text-xs text-ink-3">
                    {i + 1}
                  </span>
                  <input
                    value={f.sku}
                    onChange={(e) => onSaisie(f.id, e.target.value)}
                    onBlur={() => f.sku.trim() && onChercher(f.id)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      onChercher(f.id);
                      const suivant = fiches[i + 1];
                      if (suivant) {
                        document
                          .querySelector<HTMLInputElement>(`#sku-${suivant.id}`)
                          ?.focus();
                      } else if (fiches.length < MAX_FICHES) {
                        onAjout();
                      }
                    }}
                    id={`sku-${f.id}`}
                    placeholder={i === 0 ? "Ex : PRL1" : "SKU suivant…"}
                    autoCapitalize="characters"
                    autoFocus={i === 0}
                    className={`min-w-0 flex-1 rounded-md border-2 px-4 py-3 font-sans text-md font-bold uppercase text-ink outline-none transition-colors ${
                      f.lookup.phase === "erreur"
                        ? "border-neg"
                        : f.lookup.phase === "ok"
                          ? "border-pos"
                          : "border-accent"
                    }`}
                  />
                  <span className="flex w-6 flex-none justify-center">
                    {f.lookup.phase === "encours" && (
                      <Loader2 className="h-[18px] w-[18px] motion-safe:animate-spin text-accent-text" />
                    )}
                    {f.lookup.phase === "ok" && (
                      <Check className="h-[18px] w-[18px] text-pos" strokeWidth={2.6} />
                    )}
                    {f.lookup.phase === "erreur" && (
                      <AlertTriangle className="h-[18px] w-[18px] text-neg" />
                    )}
                  </span>
                  {fiches.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onRetrait(f.id)}
                      aria-label={`Retirer la ligne ${i + 1}`}
                      className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-neg"
                    >
                      <X className="h-4 w-4" strokeWidth={2.2} />
                    </button>
                  )}
                </div>

                {/* Message sous la ligne concernée, pas en haut de page : à cinq
                    lignes, une erreur globale ne dit pas laquelle a échoué. */}
                {f.lookup.phase === "erreur" && (
                  <p className="ml-[30px] text-sm text-neg">
                    {f.lookup.message}
                  </p>
                )}
                {doublon && (
                  <p className="ml-[30px] text-sm text-warn">
                    Ce SKU apparaît plusieurs fois : les annonces s&apos;écraseront
                    l&apos;une l&apos;autre à l&apos;enregistrement.
                  </p>
                )}
                {f.article && (
                  <div className="ml-[30px] flex flex-wrap items-center gap-2.5">
                    <StatutBadge statut={f.article.statut} />
                    <span className="text-sm font-medium text-ink-3">
                      {[f.article.marque, f.article.categorie]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    {f.article.lot && (
                      <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink-3">
                        Lot : {f.article.lot}
                      </span>
                    )}
                    {f.article.titreAnnonce && (
                      <span className="rounded-full bg-warn-soft px-2.5 py-1 text-xs font-semibold text-warn">
                        Annonce existante — sera écrasée
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {fiches.length < MAX_FICHES && (
          <button
            type="button"
            onClick={onAjout}
            className="mt-3.5 inline-flex min-h-11 items-center gap-2 rounded-lg border-2 border-dashed border-line-strong px-4 text-base font-semibold text-accent-text transition-colors hover:border-accent"
          >
            <Plus className="h-4 w-4" strokeWidth={2.3} />
            Ajouter un article
          </button>
        )}
      </div>
    </div>
  );
}
