"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Download, ImageOff, Layers, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { pluriel } from "@/lib/format";
import { toastErreur } from "@/lib/toast";
import { ligneReglages } from "@/lib/studioReglagesVersion";
import {
  lireSkuAnnonce,
  nomVersion,
  urlZipVersion,
  versionsAffichees,
  type PhotoVersion,
  type VersionAffichee,
  type VersionEnBase,
  type VersionUn,
} from "@/lib/studioVersion";

import { SectionEtape } from "./SectionEtape";
import TexteAnnonce from "./TexteAnnonce";
import { patchVersion } from "./versionApi";

const LIBELLE = "text-xs font-bold uppercase tracking-[0.05em] text-ink-3";
const srcDe = (p: PhotoVersion) => `/api/studio/image?${p.type}=${p.id}`;

/**
 * « Versions » of the bag (PRD 2026-11-16, §2): Version 1 is the current
 * listing of the bag shown in the sheet (validated images, title, dashes,
 * keywords, its SKU), read again at every display and never stored; the next
 * ones are made by « Enregistrer en Version N » of the batch retouch panel.
 *
 * Each version: its photos (one zip of them all, « Télécharger les N photos »),
 * for Version 2 onwards the retouch settings that made it, its listing SKU
 * (typed by Aramis, saved), its title and its description in three blocks — the
 * dashes, the keywords, the SKU line (`TexteAnnonce`: editable by hand from
 * Version 2, and « Reformuler »). « Copier la description » copies the dashes,
 * ONE empty line, the keywords and the SKU right below them
 * (`texteDescription`). No link and no action towards Vinted.
 */
export default function Versions({
  ouverte,
  onBasculer,
  cle,
  versionUn,
  versions,
  choisie,
  onChoisir,
  onVersionModifiee,
}: {
  ouverte: boolean;
  onBasculer: () => void;
  /** The colourway of the sheet (key), for the zip of a version. */
  cle: string;
  /** The current listing of the bag shown in the sheet; null without a bag. */
  versionUn: VersionUn | null;
  versions: readonly VersionEnBase[];
  choisie: number;
  onChoisir: (numero: number) => void;
  onVersionModifiee: (v: VersionEnBase) => void;
}) {
  const liste = versionsAffichees(versionUn, versions);
  const v = liste.find((x) => x.numero === choisie) ?? liste[0];

  return (
    <SectionEtape
      etape="versions"
      numero={<Layers size={15} aria-hidden />}
      titre="Versions"
      ouverte={ouverte}
      onBasculer={onBasculer}
      resume={pluriel(liste.length, "version", "versions")}
    >
      <div role="tablist" aria-label="Versions du sac" className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
        {liste.map((x) => {
          const actif = x.numero === v.numero;
          const premiere = x.photos[0];
          return (
            <button
              key={x.numero}
              type="button"
              role="tab"
              id={`version-${x.numero}-onglet`}
              aria-selected={actif}
              aria-controls="version-detail"
              onClick={() => onChoisir(x.numero)}
              className={cn(
                "flex min-h-[74px] items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors duration-fast",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                actif ? "border-accent bg-accent-soft ring-1 ring-accent" : "border-line bg-surface hover:border-line-strong",
              )}
            >
              <span className="flex h-[54px] w-[40px] flex-none items-center justify-center overflow-hidden rounded-xs border border-line bg-surface-3 text-ink-3">
                {premiere ? (
                  // eslint-disable-next-line @next/next/no-img-element -- image privée servie par /api/studio/image
                  <img src={srcDe(premiere)} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" />
                ) : (
                  <ImageOff size={16} aria-hidden />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-semibold text-ink">{nomVersion(x.numero)}</span>
                <span className="block truncate font-mono text-xs text-ink-2">
                  {x.skuAnnonce ? `${x.skuAnnonce} · ` : ""}
                  {pluriel(x.photos.length, "photo", "photos")}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <DetailVersion key={v.id ?? "v1"} version={v} cle={cle} skuSac={versionUn?.sku ?? null} onVersionModifiee={onVersionModifiee} />
    </SectionEtape>
  );
}

/** The reading line of the retouch settings of a version (Version 2 onwards). */
function LigneReglages({ retouches }: { retouches: NonNullable<VersionAffichee["retouches"]> }) {
  const ligne = ligneReglages(retouches);
  const idDetail = useId();
  if (!ligne) return null;
  return (
    <p className="mt-1.5 flex items-start gap-1.5 text-sm text-ink-2">
      <SlidersHorizontal size={14} className="mt-[3px] flex-none text-ink-3" aria-hidden />
      <span>
        <span className="text-ink-3">Retouches : </span>
        <span
          data-testid="version-reglages"
          // The detail shows on hover (title), and is read by assistive tech through aria-describedby.
          title={ligne.detail ?? undefined}
          tabIndex={ligne.detail ? 0 : undefined}
          aria-describedby={ligne.detail ? idDetail : undefined}
          className={cn(ligne.detail && "cursor-help underline decoration-dotted underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus")}
        >
          {ligne.texte}
        </span>
        {ligne.detail && (
          <span id={idDetail} className="sr-only whitespace-pre-line">
            {ligne.detail}
          </span>
        )}
      </span>
    </p>
  );
}

function DetailVersion({
  version: v,
  cle,
  skuSac,
  onVersionModifiee,
}: {
  version: VersionAffichee;
  cle: string;
  skuSac: string | null;
  onVersionModifiee: (v: VersionEnBase) => void;
}) {
  const idSku = useId();
  const premiere = v.id === null;
  const [saisie, setSaisie] = useState(v.skuAnnonce ?? "");
  const [etat, setEtat] = useState<"repos" | "envoi" | "enregistre">("repos");
  useEffect(() => setSaisie(v.skuAnnonce ?? ""), [v.skuAnnonce]);
  const lu = lireSkuAnnonce(saisie);
  const sku = lu.ok ? lu.sku : saisie.trim().toUpperCase() || null;

  // One saving at a time for the whole version (SKU and text): each answer carries the entire version.
  const file = useRef<Promise<unknown>>(Promise.resolve());
  const enfiler = useCallback(<T,>(tache: () => Promise<T>): Promise<T> => {
    const suite = file.current.then(tache, tache);
    file.current = suite.catch(() => undefined);
    return suite;
  }, []);

  async function enregistrerSku() {
    if (premiere || !v.id || etat === "envoi") return;
    const id = v.id;
    if (!lu.ok) {
      toastErreur(lu.message);
      return;
    }
    if ((lu.sku ?? null) === (v.skuAnnonce ?? null)) {
      setSaisie(lu.sku ?? "");
      return;
    }
    setEtat("envoi");
    const res = await enfiler(() => patchVersion(id, { skuAnnonce: lu.sku }));
    if (!res.ok) {
      toastErreur(`SKU non enregistré : ${res.message}`);
      setEtat("repos");
      return;
    }
    onVersionModifiee(res.version);
    setEtat("enregistre");
  }

  const nbPhotos = v.photos.length;
  const urlZip = urlZipVersion({ cle, numero: v.numero, sku: premiere ? skuSac : null });
  const libelleZip = nbPhotos === 1 ? "Télécharger la photo" : `Télécharger les ${nbPhotos} photos`;

  return (
    <div id="version-detail" role="tabpanel" aria-labelledby={`version-${v.numero}-onglet`} className="mt-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-baseline gap-2">
              <h3 className="text-md font-semibold text-ink">Photos de la version</h3>
              <span className="font-mono text-xs font-medium text-ink-2">{nbPhotos}</span>
            </div>
            {nbPhotos > 0 ? (
              // One zip of every photo of the version, in order: 01.jpg, 02.jpg… (stored bytes, never recompressed).
              <Button asChild variant="secondary" size="sm">
                <a href={urlZip} download data-testid="version-telecharger">
                  <Download size={14} aria-hidden /> {libelleZip}
                </a>
              </Button>
            ) : (
              <Button variant="secondary" size="sm" disabled>
                <Download size={14} aria-hidden /> Aucune photo à télécharger
              </Button>
            )}
          </div>
          {!premiere && v.retouches && <LigneReglages retouches={v.retouches} />}
        </div>
        <div className="w-[260px] max-w-full">
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor={idSku} className={LIBELLE}>
              SKU d’annonce
            </label>
            <span className="text-xs text-ink-3" aria-live="polite">
              {premiere ? "le SKU du sac" : etat === "envoi" ? "Enregistrement…" : etat === "enregistre" ? "Enregistré" : ""}
            </span>
          </div>
          <input
            id={idSku}
            type="text"
            autoComplete="off"
            spellCheck={false}
            readOnly={premiere}
            value={premiere ? (skuSac ?? "") : saisie}
            placeholder={premiere ? "Aucun sac" : "SKU de l’annonce"}
            onChange={(e) => {
              setSaisie(e.target.value);
              setEtat("repos");
            }}
            onBlur={() => void enregistrerSku()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void enregistrerSku();
              }
            }}
            className={cn(
              "mt-1 block h-9 w-full rounded border border-line-strong bg-surface px-3 font-mono text-base text-ink transition-colors duration-fast placeholder:font-sans placeholder:text-ink-3",
              "focus-visible:border-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
              premiere && "cursor-default bg-surface-2 text-ink-2",
            )}
          />
        </div>
      </div>

      {v.photos.length > 0 ? (
        <ul aria-label={`Photos de la ${nomVersion(v.numero)}`} className="mt-2 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(148px,1fr))]">
          {v.photos.map((p, i) => (
            <li key={`${p.type}-${p.id}`} className="min-w-0">
              <div className="relative aspect-[3/4] overflow-hidden rounded-md border border-line bg-surface-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- image privée servie par /api/studio/image */}
                <img src={srcDe(p)} alt={`Photo ${i + 1} de la ${nomVersion(v.numero)}`} loading="lazy" draggable={false} className="h-full w-full object-cover" />
                <span className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-accent font-mono text-xs font-bold text-accent-ink">
                  {i + 1}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 max-w-[65ch] text-base text-ink-2">
          {premiere
            ? `Aucune image validée pour ${skuSac ?? "ce sac"} : la Version 1 n’a pas de photo du Studio.`
            : "Cette version n’a pas de photo."}
        </p>
      )}

      <TexteAnnonce version={v} sku={sku} enfiler={enfiler} onVersionModifiee={onVersionModifiee} />
    </div>
  );
}
