"use client";

// Étape 2 : photos et caractéristiques d'UN article.
//
// Le composant reçoit UNE fiche. C'est ce qui rend impossible le bug de
// l'ancienne version, où un `<input type=file>` unique était rendu deux fois
// avec la même ref : ici chaque fiche a son propre input, monté une seule fois,
// et les fichiers ne peuvent pas atterrir dans la mauvaise.

import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Plus, RotateCcw, RotateCw, Upload, X, ZoomIn } from "lucide-react";
import { usePrixReferences } from "@/lib/hooks";
import { ETATS, MATIERES_SUGGESTIONS, TAILLES } from "@/lib/listingOptions";
import { pickPrix } from "@/lib/pickPrix";
import type { PromptTemplateDTO } from "@/lib/types";
import { COULEURS_VINTED } from "@/lib/vintedReferentiels";
import { pickVintedMapping } from "@/lib/vintedMapping";
import { fichiersImages } from "../_fichiers";
import {
  MAX_PHOTOS,
  MAX_SELECT,
  MIN_SELECT,
  type ArticleEnCours,
  type Qcm,
} from "../_reducer";
import { Chip, cardCls, inputCls, labelCls } from "../_ui";

const AUTRE = "Autre…";

// Marques proposées en chips : celles qui sortent réellement des lots.
// Les autres restent accessibles via « Autre… » + datalist.
const MARQUES_CHIPS = [
  "Ralph Lauren",
  "Tommy Hilfiger",
  "Lacoste",
  "Adidas",
  "Dickies",
  "Helly Hansen",
  "Nike",
];

const MARQUES_LIST = [
  "Nike", "Adidas", "Puma", "Lacoste", "Lacoste Sport", "Reebok",
  "Under Armour", "Fila", "Le Coq Sportif", "Champion", "Columbia",
  "Hurley", "Ralph Lauren", "Tommy Hilfiger", "Levi's",
];

const CATEGORIES_LIST = [
  "Polo", "Pull", "Chemise", "Sweat", "Veste", "Short", "Jogging", "Jean", "Bermuda",
  "Sac à dos",
];

/**
 * Formats acceptés au sélecteur de fichiers.
 *
 * ⚠️ HEIC inclus : les photos d'iPhone sont en HEIC par défaut, et l'ancienne
 * liste (`image/jpeg,.jpg,.jpeg`) les rendait tout simplement invisibles dans
 * le Finder. On ne pouvait les fournir que par glisser-déposer ou collage.
 */
const ACCEPT_IMAGES = "image/jpeg,image/heic,image/heif,image/png,.jpg,.jpeg,.heic,.heif,.png";

type Props = {
  fiche: ArticleEnCours;
  /** Cette fiche est-elle celle qu'on regarde ? Conditionne le collage. */
  active: boolean;
  prompts: PromptTemplateDTO[];
  nomPromptDetecte: string;
  onPhotos: (files: File[]) => void;
  onRetraitPhoto: (photoId: string) => void;
  onRotation: (photoId: string, delta: number) => void;
  onSelection: (photoId: string) => void;
  onZoom: (photoId: string) => void;
  onQcm: (champ: keyof Qcm, valeur: string | boolean | number[]) => void;
  onPrompt: (promptId: string | null) => void;
  montrerChoixPrompt: boolean;
  onBasculerChoixPrompt: () => void;
};

export default function FicheArticle({
  fiche,
  active,
  prompts,
  nomPromptDetecte,
  onPhotos,
  onRetraitPhoto,
  onRotation,
  onSelection,
  onZoom,
  onQcm,
  onPrompt,
  montrerChoixPrompt,
  onBasculerChoixPrompt,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { qcm } = fiche;

  const fileName = (i: number) =>
    `${fiche.article?.sku ?? "PHOTO"}_${String(i + 1).padStart(2, "0")}.jpg`;

  // Coller une image (⌘V) — uniquement sur la fiche affichée. Sans cette
  // garde, une image collée n'aurait aucune raison d'atterrir sur celle-ci
  // plutôt que sur une autre des cinq.
  const onPhotosRef = useRef(onPhotos);
  onPhotosRef.current = onPhotos;
  useEffect(() => {
    if (!active) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imgs: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.kind === "file" && it.type.startsWith("image/")) {
          const f = it.getAsFile();
          if (f) imgs.push(f);
        }
      }
      // Pas d'image dans le presse-papier → on laisse le collage natif (texte).
      if (imgs.length === 0) return;
      e.preventDefault();
      onPhotosRef.current(imgs);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [active]);

  // Le mapping Vinted résolu pour CETTE fiche. Sa présence arme le pilote
  // automatique de l'extension et conditionne l'affichage de la carte Vinted.
  const mappingVinted = useMemo(
    () => pickVintedMapping(qcm.marque, qcm.categorie),
    [qcm.marque, qcm.categorie],
  );

  // Prix suggéré — pré-rempli depuis les prix de référence dès que marque et
  // catégorie sont connues (détectées au lookup SKU, ou changées à la main).
  //
  // Ce composant n'existe QUE quand `fiche.article` est résolu (page.tsx ne le
  // monte pas avant) : cet effet ne peut donc jamais tourner sur une fiche pas
  // encore rattachée à un article, et ne verrouille jamais un prix par défaut
  // avant que marque/catégorie soient réellement connues.
  //
  // Invariant : ne JAMAIS écraser un `qcm.prix` non vide, qu'il vienne d'une
  // saisie manuelle ou d'un pré-remplissage précédent — une fois posé, le champ
  // devient la source de vérité et cesse d'être suivi.
  const { data: prixRefs = [] } = usePrixReferences();
  const onQcmRef = useRef(onQcm);
  onQcmRef.current = onQcm;
  useEffect(() => {
    if (qcm.prix !== "") return;
    const match = pickPrix(prixRefs, qcm.marque || null, qcm.categorie || null);
    if (match) onQcmRef.current("prix", String(match.prix));
  }, [qcm.marque, qcm.categorie, qcm.prix, prixRefs]);

  // Une catégorie Vinted sans champ taille (les sacs, par exemple) : la carte
  // Taille est masquée, mais `fichePrete()` l'exige toujours. On pose
  // « Unique » pour que la fiche reste générable sans relâcher une garde qui
  // protège toutes les autres catégories.
  useEffect(() => {
    if (!mappingVinted || mappingVinted.aUneTaille) return;
    if (qcm.taille !== "Unique") onQcmRef.current("taille", "Unique");
  }, [mappingVinted, qcm.taille]);

  // Matières par défaut du mapping — posées seulement si RIEN n'a été choisi.
  // Ne jamais écraser une saisie : même invariant que le prix suggéré.
  useEffect(() => {
    if (!mappingVinted) return;
    if (qcm.matiere !== "" || qcm.matiere2 !== "") return;
    onQcmRef.current("matiere", mappingVinted.materiauxDefaut[0] ?? "");
    onQcmRef.current("matiere2", mappingVinted.materiauxDefaut[1] ?? "");
  }, [mappingVinted, qcm.matiere, qcm.matiere2]);

  // Glisser-déposer. Sans `preventDefault` sur `dragover`, le navigateur refuse
  // le dépôt et se contente d'ouvrir le fichier à la place de la page — il
  // n'existe pas de « zone de dépôt » par défaut.
  //
  // La fiche ENTIÈRE écoute, pas la seule carte photos : on vise une colonne de
  // 340 px en glissant depuis Photos, et rater la cible ne doit pas être puni.
  // Le surlignage, lui, reste sur la carte photos — il dit où ça atterrit.
  const [survol, setSurvol] = useState(false);

  function auSurvol(e: React.DragEvent) {
    e.preventDefault();
    setSurvol(true);
  }

  function auDepart(e: React.DragEvent) {
    // `relatedTarget` est l'élément survolé après la sortie. S'il est encore
    // dans la fiche, on n'a fait que passer d'une vignette à l'autre : le
    // surlignage doit tenir.
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSurvol(false);
  }

  function auDepot(e: React.DragEvent) {
    e.preventDefault();
    setSurvol(false);
    const images = fichiersImages(Array.from(e.dataTransfer.files));
    if (images.length > 0) onPhotos(images);
  }

  const marqueChips = useMemo(() => {
    const base = [...MARQUES_CHIPS];
    if (qcm.marque && !qcm.marqueCustom && !base.includes(qcm.marque))
      base.unshift(qcm.marque);
    return base;
  }, [qcm.marque, qcm.marqueCustom]);

  const categorieChips = useMemo(() => {
    const base = [...CATEGORIES_LIST];
    if (qcm.categorie && !qcm.categorieCustom && !base.includes(qcm.categorie))
      base.unshift(qcm.categorie);
    return base;
  }, [qcm.categorie, qcm.categorieCustom]);

  const matieres = [qcm.matiere, qcm.matiere2].filter(Boolean);

  function toggleMatiere(m: string) {
    const next = matieres.includes(m)
      ? matieres.filter((x) => x !== m)
      : matieres.length >= 2
        ? matieres
        : [...matieres, m];
    onQcm("matiere", next[0] ?? "");
    onQcm("matiere2", next[1] ?? "");
  }

  /**
   * Vinted plafonne la couleur à 2 — et au-delà de la limite il ne refuse
   * PAS le clic : il évince silencieusement la plus ancienne sélection
   * (FIFO, cf. docs/audits/…-nike-backpack.md §5). On refuse ici plutôt que
   * de laisser Vinted décider à notre place de quelle couleur perdre.
   */
  function basculerCouleur(id: number) {
    const actuelles = qcm.couleurs;
    if (actuelles.includes(id)) {
      onQcm("couleurs", actuelles.filter((x) => x !== id));
      return;
    }
    if (actuelles.length >= 2) return;
    onQcm("couleurs", [...actuelles, id]);
  }

  return (
    <div
      onDragEnter={auSurvol}
      onDragOver={auSurvol}
      onDragLeave={auDepart}
      onDrop={auDepot}
      className="grid grid-cols-1 items-start gap-[18px] [animation:stepIn_.3s_both] lg:grid-cols-[340px_1fr]"
    >
      {/* ── Photos : la fiche entière accepte le dépôt, la carte le signale ── */}
      <div
        className={`${cardCls} p-5 transition-[outline-color] lg:sticky lg:top-5 ${
          survol
            ? "outline outline-2 -outline-offset-2 outline-[var(--acc)]"
            : "outline outline-2 -outline-offset-2 outline-transparent"
        }`}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-grotesk text-[16px] font-bold">Photos</h2>
          <span
            className={`rounded-full px-2.5 py-1 text-[12px] font-bold ${
              fiche.selected.length >= MIN_SELECT
                ? "bg-[var(--pos-soft)] text-[var(--pos)]"
                : "bg-[var(--tint)] text-[var(--faint)]"
            }`}
          >
            {fiche.selected.length} / {MAX_SELECT}
          </span>
        </div>
        <p className="mb-3.5 text-[12.5px] font-medium text-[var(--faint-2)]">
          Choisis {MIN_SELECT} à {MAX_SELECT} photos pour l&apos;IA. L&apos;ordre = priorité.
        </p>

        <div className="grid grid-cols-2 gap-2.5">
          {fiche.photos.map((p, i) => {
            const order = fiche.selected.indexOf(p.id);
            const sel = order >= 0;
            return (
              <div
                key={p.id}
                className={`relative aspect-square overflow-hidden rounded-[13px] border-[2.5px] transition-all ${
                  sel
                    ? "border-[var(--acc)] shadow-[var(--shadow)]"
                    : "border-transparent outline outline-1 outline-[var(--border)]"
                }`}
              >
                <button
                  onClick={() => onSelection(p.id)}
                  aria-pressed={sel}
                  aria-label={`Sélectionner la photo ${i + 1}`}
                  className="block h-full w-full"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={fileName(i)} className="h-full w-full object-cover" />
                </button>
                {sel && (
                  <span className="pointer-events-none absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--acc)] font-mono text-[11px] font-bold text-[var(--acc-ink)] [animation:popIn_.18s_ease]">
                    {order + 1}
                  </span>
                )}
                <button
                  onClick={() => onRetraitPhoto(p.id)}
                  aria-label={`Supprimer la photo ${i + 1}`}
                  className="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--ink)]/55 text-[var(--bg)] transition-colors hover:bg-[var(--ink)]/80"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2.4} />
                </button>
                <button
                  onClick={() => onRotation(p.id, -90)}
                  aria-label="Tourner à gauche"
                  className="absolute bottom-1.5 left-1.5 z-10 flex h-[30px] w-[30px] items-center justify-center rounded-full bg-white/90 text-[var(--ink2)] shadow-sm transition-colors hover:text-[var(--acc)]"
                >
                  <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
                <button
                  onClick={() => onRotation(p.id, 90)}
                  aria-label="Tourner à droite"
                  className="absolute bottom-1.5 left-[42px] z-10 flex h-[30px] w-[30px] items-center justify-center rounded-full bg-white/90 text-[var(--ink2)] shadow-sm transition-colors hover:text-[var(--acc)]"
                >
                  <RotateCw className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
                <button
                  onClick={() => onZoom(p.id)}
                  aria-label={`Agrandir la photo ${i + 1}`}
                  className="absolute bottom-1.5 right-1.5 z-10 flex h-[30px] w-[30px] items-center justify-center rounded-full bg-white/92 text-[var(--acc)] shadow-sm transition-colors hover:bg-surface"
                >
                  <ZoomIn className="h-3.5 w-3.5" strokeWidth={2.2} />
                </button>
              </div>
            );
          })}

          {fiche.photos.length < MAX_PHOTOS && (
            <button
              onClick={() => fileRef.current?.click()}
              className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-[13px] border-2 border-dashed border-[var(--border-strong)] text-[var(--acc)] transition-colors hover:border-[var(--acc)] hover:bg-[var(--surface-2)]"
              aria-label="Ajouter des photos"
            >
              <Plus className="h-[22px] w-[22px]" strokeWidth={2} />
              <span className="text-[11.5px] font-bold">Ajouter</span>
            </button>
          )}
        </div>

        <p className="mt-3 flex items-start gap-2 text-[12px] font-medium text-[var(--faint-2)]">
          <Upload className="mt-0.5 h-3.5 w-3.5 flex-none text-[var(--acc)]" strokeWidth={2} />
          <span>
            Glisse, ou <b className="font-bold text-[var(--acc)]">colle</b> (⌘V) sur cette
            fiche. Jusqu&apos;à {MAX_PHOTOS} photos.
          </span>
        </p>

        {/* Un seul input, propre à CETTE fiche. */}
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT_IMAGES}
          multiple
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            onPhotos(files);
          }}
          className="hidden"
        />
      </div>

      {/* ── Caractéristiques ───────────────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        <div className={`${cardCls} p-5 md:px-6`}>
          <span className={labelCls}>Détecté depuis le lot — modifiable</span>
          <div className="mt-3.5 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Marque</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {marqueChips.map((m) => (
                  <Chip
                    key={m}
                    value={m}
                    active={!qcm.marqueCustom && qcm.marque === m}
                    onClick={() => {
                      onQcm("marqueCustom", false);
                      onQcm("marque", m);
                    }}
                  />
                ))}
                <Chip
                  value={AUTRE}
                  active={qcm.marqueCustom}
                  onClick={() => {
                    onQcm("marqueCustom", true);
                    onQcm("marque", "");
                  }}
                />
              </div>
              {qcm.marqueCustom && (
                <>
                  <input
                    value={qcm.marque}
                    onChange={(e) => onQcm("marque", e.target.value)}
                    list="marques-list"
                    placeholder="Saisis la marque"
                    autoFocus
                    className={`${inputCls} mt-2.5 border-[1.5px] border-[var(--acc)]`}
                  />
                  <datalist id="marques-list">
                    {MARQUES_LIST.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </>
              )}
            </div>

            <div>
              <label className={labelCls}>Catégorie</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {categorieChips.map((c) => (
                  <Chip
                    key={c}
                    value={c}
                    active={!qcm.categorieCustom && qcm.categorie === c}
                    onClick={() => {
                      onQcm("categorieCustom", false);
                      onQcm("categorie", c);
                    }}
                  />
                ))}
                <Chip
                  value={AUTRE}
                  active={qcm.categorieCustom}
                  onClick={() => {
                    onQcm("categorieCustom", true);
                    onQcm("categorie", "");
                  }}
                />
              </div>
              {qcm.categorieCustom && (
                <input
                  value={qcm.categorie}
                  onChange={(e) => onQcm("categorie", e.target.value)}
                  placeholder="Saisis la catégorie"
                  autoFocus
                  className={`${inputCls} mt-2.5 border-[1.5px] border-[var(--acc)]`}
                />
              )}
            </div>
          </div>
        </div>

        <div className={`${cardCls} p-5 md:px-6`}>
          {(!mappingVinted || mappingVinted.aUneTaille) && (
            <>
              <ChampRequis label="Taille" ok={!!qcm.taille}>
                {TAILLES.map((t) => (
                  <Chip
                    key={t}
                    value={t}
                    active={qcm.taille === t}
                    onClick={() => onQcm("taille", qcm.taille === t ? "" : t)}
                  />
                ))}
              </ChampRequis>

              <div className="my-4 h-px bg-[var(--bg)]" />
            </>
          )}

          <ChampRequis label="État" ok={!!qcm.etat}>
            {ETATS.map((s) => (
              <Chip
                key={s}
                value={s}
                active={qcm.etat === s}
                onClick={() => onQcm("etat", qcm.etat === s ? "" : s)}
              />
            ))}
          </ChampRequis>

          <div className="my-4 h-px bg-[var(--bg)]" />

          <div>
            <div className="flex items-center gap-2.5">
              <label className="text-[12.5px] font-bold tracking-[0.03em] text-[var(--ink)]">
                Matière
              </label>
              <span className="text-[11px] font-semibold text-[var(--faint-2)]">
                jusqu&apos;à 2 · optionnel
              </span>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-2.5">
              {MATIERES_SUGGESTIONS.map((m) => (
                <Chip
                  key={m}
                  value={m}
                  active={matieres.includes(m)}
                  onClick={() => toggleMatiere(m)}
                />
              ))}
            </div>
          </div>
        </div>

        <div className={`${cardCls} p-5 md:px-6`}>
          <label className={labelCls}>Infos supplémentaires</label>
          <textarea
            value={qcm.details}
            onChange={(e) => onQcm("details", e.target.value)}
            rows={2}
            placeholder="Ex : dernière collection, coupe slim, voir photo 4…"
            className={`${inputCls} mt-2 resize-y leading-[1.55]`}
          />
          <div className="mt-3.5 flex flex-wrap items-center gap-2.5 rounded-xl bg-[var(--surface-2)] px-4 py-3">
            <FileText className="h-4 w-4 flex-shrink-0 text-[var(--acc)]" strokeWidth={2} />
            <span className="text-[13px] font-medium text-[var(--ink2)]">
              Prompt : <b className="text-[var(--acc)]">{nomPromptDetecte}</b>
            </span>
            <button
              onClick={onBasculerChoixPrompt}
              className="ml-auto text-[12px] font-semibold text-[var(--faint)] transition-colors hover:text-[var(--acc)]"
            >
              {montrerChoixPrompt ? "Fermer" : "Changer"}
            </button>
          </div>
          {montrerChoixPrompt && (
            <select
              value={fiche.promptId ?? ""}
              onChange={(e) => onPrompt(e.target.value || null)}
              className={`${inputCls} mt-2.5`}
            >
              <option value="">— Sélection automatique —</option>
              {prompts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom}
                </option>
              ))}
            </select>
          )}
        </div>

        {mappingVinted && (
          <div className={`${cardCls} p-5 md:px-6`}>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className={labelCls}>Vinted — pilote automatique</span>
              <span className="rounded-full bg-[var(--pos-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--pos)]">
                armé
              </span>
            </div>

            {/* Ce que l'extension enverra sans rien demander. Affiché parce
                qu'une valeur figée invisible est une valeur qu'on découvre
                sur l'annonce publiée. */}
            <p className="mt-2.5 font-mono text-[12px] text-[var(--faint-2)]">
              {mappingVinted.rechercheCategorie} · {mappingVinted.filAriane} ·{" "}
              {mappingVinted.marque} · colis Petit · unisexe
            </p>

            <div className="mt-4">
              <div className="flex items-center gap-2.5">
                <label className="text-[12.5px] font-bold tracking-[0.03em] text-[var(--ink)]">
                  Couleur
                </label>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    qcm.couleurs.length > 0
                      ? "bg-[var(--pos-soft)] text-[var(--pos)]"
                      : "bg-[var(--neg-soft)] text-[var(--neg)]"
                  }`}
                >
                  {qcm.couleurs.length > 0 ? `${qcm.couleurs.length} / 2` : "requis"}
                </span>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {COULEURS_VINTED.map((c) => {
                  const active = qcm.couleurs.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => basculerCouleur(c.id)}
                      aria-pressed={active}
                      className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl border-[1.5px] px-3 text-[13px] font-semibold transition-all ${
                        active
                          ? "border-[var(--acc)] bg-[var(--acc)] text-[var(--acc-ink)] shadow-[var(--shadow)]"
                          : "border-[var(--border)] bg-surface text-[var(--ink2)] hover:border-[var(--border-strong)]"
                      }`}
                    >
                      <span
                        aria-hidden
                        className="h-3.5 w-3.5 flex-none rounded-full border border-[var(--border-strong)]"
                        style={
                          c.hex
                            ? { background: c.hex }
                            : {
                                background:
                                  "conic-gradient(#e11,#fb0,#2b2,#09c,#71d,#e11)",
                              }
                        }
                      />
                      {c.libelle}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div className={`${cardCls} p-5 md:px-6`}>
          <label className={labelCls}>Prix suggéré</label>
          <input
            type="number"
            min={0}
            step={0.5}
            inputMode="decimal"
            value={qcm.prix}
            onChange={(e) => onQcm("prix", e.target.value)}
            placeholder="0,00"
            className={`${inputCls} mt-2 font-mono`}
          />
        </div>
      </div>
    </div>
  );
}

function ChampRequis({
  label,
  ok,
  children,
}: {
  label: string;
  ok: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <label className="text-[12.5px] font-bold tracking-[0.03em] text-[var(--ink)]">
          {label}
        </label>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
            ok ? "bg-[var(--pos-soft)] text-[var(--pos)]" : "bg-[var(--neg-soft)] text-[var(--neg)]"
          }`}
        >
          {ok ? "ok" : "requis"}
        </span>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2.5">{children}</div>
    </div>
  );
}
