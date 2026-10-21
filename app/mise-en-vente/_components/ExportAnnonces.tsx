"use client";

// Étape 4 : les annonces générées, prêtes à copier et à enregistrer.
//
// Deux façons d'enregistrer, parce que les deux cas sont réels : « les cinq
// pareil » (boutons groupés) et « celui-là est à part » (boutons par fiche).
// Les enregistrements groupés partent EN SÉRIE, jamais en parallèle — cf. la
// note sur le rollback optimiste dans page.tsx.

import { useState } from "react";
import { AlertTriangle, ArrowRight, Check, Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
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

/** Champ édité en place dans un bloc grisé : sans cadre, mais avec un anneau de focus. */
const CHAMP_DANS_BLOC =
  "w-full rounded-sm bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2";

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
    <div className="flex flex-col gap-4 motion-safe:animate-entree">
      {/* Actions groupées */}
      {generees.length > 1 && (
        <div className={`${cardCls} flex flex-wrap items-center gap-2.5 px-5 py-4`}>
          <span className="text-base font-semibold text-ink-2">
            {generees.length} annonces — tout enregistrer en :
          </span>
          <Button
            variant="secondary"
            disabled={enregistrementEnCours}
            onClick={() => onEnregistrerTout("Brouillon")}
          >
            Brouillon
          </Button>
          <Button
            disabled={enregistrementEnCours}
            onClick={() => onEnregistrerTout("En vente")}
          >
            En vente
          </Button>
          {generees.some(
            (f) =>
              pickVintedMapping(f.qcm.marque, f.qcm.categorie) !== null &&
              f.qcm.couleurs.length > 0,
          ) && (
            <Button disabled={enregistrementEnCours} onClick={onPublierVintedTout}>
              Tout mettre en brouillon sur Vinted
            </Button>
          )}
          {enregistrementEnCours && (
            <span className="font-mono text-xs text-ink-3">
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
              <span className="font-sans text-md font-bold">{sku}</span>
              {f.enregistre && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-pos-soft px-3 py-1 text-xs font-bold text-pos">
                  <Check className="h-3.5 w-3.5" strokeWidth={2.6} />
                  enregistré · {f.enregistre}
                </span>
              )}
              {/* L'erreur est portée par LA fiche, pas par la session : à cinq
                  articles, un bandeau global s'accrochait à la mauvaise. */}
              {f.erreurEnregistrement && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-neg-soft px-3 py-1 text-xs font-bold text-neg">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {f.erreurEnregistrement}
                </span>
              )}
              {/* Rappelé ICI et pas seulement à la saisie : c'est au moment de
                  l'enregistrement que l'écrasement se produit. */}
              {doublon && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-soft px-3 py-1 text-xs font-bold text-warn">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  SKU en double — l&apos;autre annonce sera écrasée
                </span>
              )}
              {f.article?.titreAnnonce && !f.enregistre && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-soft px-3 py-1 text-xs font-bold text-warn">
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
                    aria-label={`Titre de l'annonce ${sku}`}
                    rows={2}
                    className={`${CHAMP_DANS_BLOC} resize-none font-sans text-md font-bold text-ink`}
                  />
                  <span className="mt-1 block text-right font-mono text-xs text-ink-3">
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
                      aria-label={`Description de l'annonce ${sku}`}
                      rows={7}
                      className={`${CHAMP_DANS_BLOC} resize-y text-base leading-[1.6] text-ink`}
                    />
                    <textarea
                      value={f.annonce.motsCles}
                      onChange={(e) => onEditerAnnonce(f.id, "motsCles", e.target.value)}
                      aria-label={`Mots-clés de l'annonce ${sku}`}
                      rows={3}
                      className={`${CHAMP_DANS_BLOC} mt-2 resize-y border-t border-line pt-2 text-sm leading-[1.55] text-ink-2`}
                    />
                  </BlocCopiable>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {f.photos.length > 0 && (
                  <div className="rounded-md border border-line bg-surface-2 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className={labelCls}>Photos ({f.photos.length})</span>
                      <span className="font-mono text-xs uppercase tracking-[0.1em] text-ink-3">
                        clic = télécharger
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {f.photos.map((p, i) => (
                        <button
                          key={p.id}
                          onClick={() => onTelecharger(f.id, p.id)}
                          className="group relative aspect-square overflow-hidden rounded border border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2"
                          title={`Télécharger ${sku}_${String(i + 1).padStart(2, "0")}.jpg`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.url} alt="" className="h-full w-full object-cover" />
                          {/* Pastille OPAQUE au survol et au focus : un voile
                              translucide + texte clair se lit mal sur une photo claire. */}
                          <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-fast group-hover:opacity-100 group-focus-visible:opacity-100">
                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-ink shadow-pop">
                              <Download aria-hidden className="h-4 w-4" strokeWidth={2.2} />
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-md border border-line p-3">
                  <span className={labelCls}>Enregistrer</span>
                  <div className="mt-2 flex flex-col gap-2">
                    <Button
                      variant="secondary"
                      size="lg"
                      disabled={enregistrementEnCours}
                      onClick={() => onEnregistrer(f.id, "Brouillon")}
                    >
                      Brouillon
                    </Button>
                    <Button
                      size="lg"
                      disabled={enregistrementEnCours}
                      onClick={() => onEnregistrer(f.id, "En vente")}
                    >
                      Mettre en vente
                      <ArrowRight aria-hidden className="h-4 w-4" strokeWidth={2.3} />
                    </Button>
                  </div>
                </div>

                {/* `<button>`, pas `<a target="_blank">` : un lien ouvrirait
                    l'onglet Vinted AU CLIC, avant que le PATCH asynchrone ait
                    résolu. Un échec produirait quand même un onglet, orphelin
                    côté extension — cf. _publierVinted.ts. */}
                <Button
                  size="lg"
                  disabled={enregistrementEnCours || couleurManquante}
                  onClick={() => onPublierVinted(f.id)}
                  className="w-full justify-start"
                >
                  <span
                    aria-hidden
                    className="flex h-8 w-8 flex-none items-center justify-center rounded bg-accent-ink/20 font-sans text-md font-extrabold"
                  >
                    V
                  </span>
                  <span className="text-left leading-tight">
                    {couleurManquante ? "Choisis une couleur" : "Publier sur Vinted"}
                  </span>
                  <ArrowRight aria-hidden className="ml-auto h-4 w-4 flex-none" strokeWidth={2.3} />
                </Button>

                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() =>
                    copier(
                      `${f.id}-tout`,
                      `${f.annonce.titre}\n\n${f.annonce.description}\n\n${f.annonce.motsCles}`
                    )
                  }
                  className="w-full"
                >
                  {copie === `${f.id}-tout` ? (
                    <Check aria-hidden className="h-4 w-4" />
                  ) : (
                    <Copy aria-hidden className="h-4 w-4" />
                  )}
                  Copier tout
                </Button>
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
    <div className="rounded-md border border-line bg-surface-2 p-4">
      <div className="mb-2 flex items-center justify-between gap-2.5">
        <span className={labelCls}>{label}</span>
        <Button variant="secondary" size="sm" onClick={onCopier}>
          {copie ? (
            <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={2.6} />
          ) : (
            <Copy aria-hidden className="h-3.5 w-3.5" strokeWidth={2} />
          )}
          {copie ? "Copié" : "Copier"}
        </Button>
      </div>
      {children}
    </div>
  );
}
