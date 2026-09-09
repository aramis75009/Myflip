"use client";

// Étape 4 : les annonces générées, prêtes à copier et à enregistrer.
//
// Deux façons d'enregistrer, parce que les deux cas sont réels : « les cinq
// pareil » (boutons groupés) et « celui-là est à part » (boutons par fiche).
// Les enregistrements groupés partent EN SÉRIE, jamais en parallèle — cf. la
// note sur le rollback optimiste dans page.tsx.

import { useState } from "react";
import { AlertTriangle, ArrowRight, Check, Copy, Download } from "lucide-react";
import { pickVintedMapping } from "@/lib/vintedMapping";
import type { ArticleEnCours } from "../_reducer";
import { cardCls, labelCls } from "../_ui";

type Props = {
  fiches: ArticleEnCours[];
  doublons: Set<string>;
  enregistrementEnCours: boolean;
  onEnregistrer: (id: string, statut: string) => void;
  onEnregistrerTout: (statut: string) => void;
  onPublierVinted: (id: string) => void;
  onPublierVintedTout: () => void;
  onEditerAnnonce: (
    id: string,
    champ: "titre" | "description" | "motsCles",
    valeur: string,
  ) => void;
  onTelecharger: (id: string, photoId: string) => void;
};

export default function ExportAnnonces({
  fiches,
  doublons,
  enregistrementEnCours,
  onEnregistrer,
  onEnregistrerTout,
  onPublierVinted,
  onPublierVintedTout,
  onEditerAnnonce,
  onTelecharger,
}: Props) {
  const [copie, setCopie] = useState<string | null>(null);
  const generees = fiches.filter((f) => f.generation.phase === "ok");

  async function copier(cle: string, valeur: string) {
    await navigator.clipboard.writeText(valeur);
    setCopie(cle);
    setTimeout(() => setCopie(null), 1600);
  }

  return (
    <div className="flex flex-col gap-4 [animation:stepIn_.3s_both]">
      {/* Actions groupées */}
      {generees.length > 1 && (
        <div className={`${cardCls} flex flex-wrap items-center gap-2.5 px-5 py-4`}>
          <span className="text-[13.5px] font-semibold text-[var(--ink2)]">
            {generees.length} annonces — tout enregistrer en :
          </span>
          <button
            disabled={enregistrementEnCours}
            onClick={() => onEnregistrerTout("Brouillon")}
            className="inline-flex min-h-[40px] items-center rounded-xl border border-[var(--border)] bg-surface px-4 text-[13px] font-semibold text-[var(--ink2)] transition-colors hover:border-[var(--border-strong)] disabled:opacity-50"
          >
            Brouillon
          </button>
          <button
            disabled={enregistrementEnCours}
            onClick={() => onEnregistrerTout("En vente")}
            className="inline-flex min-h-[40px] items-center rounded-xl bg-[var(--acc)] px-4 text-[13px] font-bold text-[var(--acc-ink)] transition-colors hover:bg-[var(--acc-hover)] disabled:opacity-50"
          >
            En vente
          </button>
          {generees.some(
            (f) =>
              pickVintedMapping(f.qcm.marque, f.qcm.categorie) !== null &&
              f.qcm.couleurs.length > 0,
          ) && (
            <button
              disabled={enregistrementEnCours}
              onClick={onPublierVintedTout}
              className="inline-flex min-h-[40px] items-center rounded-xl bg-[#09B1BA] px-4 text-[13px] font-bold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50"
            >
              Tout mettre en brouillon sur Vinted
            </button>
          )}
          {enregistrementEnCours && (
            <span className="font-mono text-[11px] text-[var(--faint)]">
              enregistrement en série…
            </span>
          )}
        </div>
      )}

      {generees.map((f) => {
        const sku = f.article?.sku ?? f.sku;
        const annonceComplete = `${f.annonce.description}\n\n${f.annonce.motsCles}\n\n${sku}`;
        const doublon = doublons.has(f.sku.trim().toUpperCase());
        const mapping = pickVintedMapping(f.qcm.marque, f.qcm.categorie);
        const couleurManquante = mapping !== null && f.qcm.couleurs.length === 0;
        return (
          <div key={f.id} className={`${cardCls} p-5 md:p-6`}>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <span className="font-grotesk text-[17px] font-bold">{sku}</span>
              {f.enregistre && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--pos-soft)] px-3 py-1 text-[12px] font-bold text-[var(--pos)]">
                  <Check className="h-3.5 w-3.5" strokeWidth={2.6} />
                  enregistré · {f.enregistre}
                </span>
              )}
              {/* L'erreur est portée par LA fiche, pas par la session : à cinq
                  articles, un bandeau global s'accrochait à la mauvaise. */}
              {f.erreurEnregistrement && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--neg-soft)] px-3 py-1 text-[12px] font-bold text-[var(--neg)]">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {f.erreurEnregistrement}
                </span>
              )}
              {/* Rappelé ICI et pas seulement à la saisie : c'est au moment de
                  l'enregistrement que l'écrasement se produit. */}
              {doublon && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--warn-soft)] px-3 py-1 text-[12px] font-bold text-[var(--warn)]">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  SKU en double — l&apos;autre annonce sera écrasée
                </span>
              )}
              {f.article?.titreAnnonce && !f.enregistre && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--warn-soft)] px-3 py-1 text-[12px] font-bold text-[var(--warn)]">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Annonce existante — sera remplacée
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
              <div>
                <BlocCopiable
                  label="Titre"
                  copie={copie === `${f.id}-t`}
                  onCopier={() => copier(`${f.id}-t`, f.annonce.titre)}
                >
                  <textarea
                    value={f.annonce.titre}
                    onChange={(e) => onEditerAnnonce(f.id, "titre", e.target.value)}
                    rows={2}
                    className="w-full resize-none bg-transparent font-grotesk text-[15px] font-bold text-[var(--ink)] outline-none"
                  />
                  <span className="mt-1 block text-right font-mono text-[10.5px] text-[var(--faint)]">
                    {f.annonce.titre.length} car.
                  </span>
                </BlocCopiable>

                <div className="mt-3.5">
                  <BlocCopiable
                    label="Description + mots-clés"
                    copie={copie === `${f.id}-a`}
                    onCopier={() => copier(`${f.id}-a`, annonceComplete)}
                  >
                    <textarea
                      value={f.annonce.description}
                      onChange={(e) => onEditerAnnonce(f.id, "description", e.target.value)}
                      rows={7}
                      className="w-full resize-y bg-transparent text-[13.5px] leading-[1.6] text-[var(--ink)] outline-none"
                    />
                    <textarea
                      value={f.annonce.motsCles}
                      onChange={(e) => onEditerAnnonce(f.id, "motsCles", e.target.value)}
                      rows={3}
                      className="mt-2 w-full resize-y border-t border-[var(--border)] bg-transparent pt-2 text-[12.5px] leading-[1.55] text-[var(--ink2)] outline-none"
                    />
                  </BlocCopiable>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {f.photos.length > 0 && (
                  <div className="rounded-[16px] border border-[var(--border)] bg-[var(--tint)] p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className={labelCls}>Photos ({f.photos.length})</span>
                      <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-[var(--faint)]">
                        clic = télécharger
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {f.photos.map((p, i) => (
                        <button
                          key={p.id}
                          onClick={() => onTelecharger(f.id, p.id)}
                          className="group relative aspect-square overflow-hidden rounded-[10px] border border-[var(--border)]"
                          title={`Télécharger ${sku}_${String(i + 1).padStart(2, "0")}.jpg`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.url} alt="" className="h-full w-full object-cover" />
                          <span className="absolute inset-0 flex items-center justify-center bg-[var(--ink)]/0 text-transparent transition-all group-hover:bg-[var(--ink)]/45 group-hover:text-white">
                            <Download className="h-4 w-4" strokeWidth={2.2} />
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-[16px] border border-[var(--border)] p-3">
                  <span className={labelCls}>Enregistrer</span>
                  <div className="mt-2 flex flex-col gap-2">
                    <button
                      disabled={enregistrementEnCours}
                      onClick={() => onEnregistrer(f.id, "Brouillon")}
                      className="inline-flex min-h-[42px] items-center justify-center rounded-xl border border-[var(--border)] bg-surface text-[13px] font-semibold text-[var(--ink2)] transition-colors hover:border-[var(--border-strong)] disabled:opacity-50"
                    >
                      Brouillon
                    </button>
                    <button
                      disabled={enregistrementEnCours}
                      onClick={() => onEnregistrer(f.id, "En vente")}
                      className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-[var(--acc)] text-[13px] font-bold text-[var(--acc-ink)] transition-colors hover:bg-[var(--acc-hover)] disabled:opacity-50"
                    >
                      Mettre en vente
                      <ArrowRight className="h-4 w-4" strokeWidth={2.3} />
                    </button>
                  </div>
                </div>

                {/* `<button>`, pas `<a target="_blank">` : un lien ouvrirait
                    l'onglet Vinted AU CLIC, avant que le PATCH asynchrone ait
                    résolu. Un échec produirait quand même un onglet, orphelin
                    côté extension — cf. _publierVinted.ts. */}
                <button
                  disabled={enregistrementEnCours || couleurManquante}
                  onClick={() => onPublierVinted(f.id)}
                  className="flex w-full items-center gap-2.5 rounded-[14px] bg-[#09B1BA] px-4 py-3 transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                >
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-white/20 font-grotesk text-[15px] font-extrabold text-white">
                    V
                  </span>
                  <span className="text-left text-[13.5px] font-bold leading-tight text-white">
                    {couleurManquante ? "Choisis une couleur" : "Publier sur Vinted"}
                  </span>
                  <ArrowRight className="ml-auto h-4 w-4 flex-none text-white" strokeWidth={2.3} />
                </button>

                <button
                  onClick={() =>
                    copier(
                      `${f.id}-tout`,
                      `${f.annonce.titre}\n\n${f.annonce.description}\n\n${f.annonce.motsCles}`
                    )
                  }
                  className="inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-surface text-[13px] font-semibold text-[var(--ink2)] transition-colors hover:border-[var(--border-strong)]"
                >
                  {copie === `${f.id}-tout` ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  Copier tout
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BlocCopiable({
  label,
  copie,
  onCopier,
  children,
}: {
  label: string;
  copie: boolean;
  onCopier: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[16px] border border-[var(--border)] bg-[var(--tint)] p-4">
      <div className="mb-2 flex items-center justify-between gap-2.5">
        <span className={labelCls}>{label}</span>
        <button
          onClick={onCopier}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-surface px-3 py-1.5 text-[12px] font-semibold text-[var(--ink2)] transition-colors hover:bg-[var(--tint)]"
        >
          {copie ? (
            <Check className="h-3.5 w-3.5" strokeWidth={2.6} />
          ) : (
            <Copy className="h-3.5 w-3.5" strokeWidth={2} />
          )}
          {copie ? "Copié" : "Copier"}
        </button>
      </div>
      {children}
    </div>
  );
}
