"use client";

import { useEffect, useId, useState } from "react";
import { Copy, ImageOff, Layers, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { pluriel } from "@/lib/format";
import { toastErreur, toastSucces } from "@/lib/toast";
import {
  lireSkuAnnonce,
  nomVersion,
  texteDescription,
  versionsAffichees,
  type PhotoVersion,
  type VersionAffichee,
  type VersionEnBase,
  type VersionUn,
} from "@/lib/studioVersion";

import { lireErreur } from "./envoi";
import { SectionEtape } from "./SectionEtape";

const LIBELLE = "text-xs font-bold uppercase tracking-[0.05em] text-ink-3";
const srcDe = (p: PhotoVersion) => `/api/studio/image?${p.type}=${p.id}`;

/** Clipboard, with the old fallback when the API is refused (non-secure context, permission). */
async function copier(texte: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texte);
    return true;
  } catch {
    const zone = document.createElement("textarea");
    zone.value = texte;
    zone.setAttribute("readonly", "");
    zone.style.position = "fixed";
    zone.style.opacity = "0";
    document.body.appendChild(zone);
    zone.select();
    const ok = document.execCommand("copy");
    zone.remove();
    return ok;
  }
}

/**
 * « Versions » of the bag (PRD 2026-11-16, §2): Version 1 is the current
 * listing of the bag shown in the sheet (validated images, title, dashes,
 * keywords, its SKU), read again at every display and never stored; the next
 * ones are made by « Enregistrer en Version N » of the batch retouch panel.
 *
 * Each version: its photos, its listing SKU (typed by Aramis, saved), its title
 * and its description in three blocks — the dashes (read only, locked), the
 * keywords, the SKU line. « Copier la description » copies the dashes, ONE
 * empty line, the keywords and the SKU right below them (`texteDescription`).
 * No link and no action towards Vinted.
 */
export default function Versions({
  ouverte,
  onBasculer,
  versionUn,
  versions,
  choisie,
  onChoisir,
  onVersionModifiee,
}: {
  ouverte: boolean;
  onBasculer: () => void;
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

      <DetailVersion key={v.id ?? "v1"} version={v} skuSac={versionUn?.sku ?? null} onVersionModifiee={onVersionModifiee} />
    </SectionEtape>
  );
}

function DetailVersion({
  version: v,
  skuSac,
  onVersionModifiee,
}: {
  version: VersionAffichee;
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

  async function enregistrerSku() {
    if (premiere || !v.id || etat === "envoi") return;
    if (!lu.ok) {
      toastErreur(lu.message);
      return;
    }
    if ((lu.sku ?? null) === (v.skuAnnonce ?? null)) {
      setSaisie(lu.sku ?? "");
      return;
    }
    setEtat("envoi");
    try {
      const res = await fetch(`/api/studio/versions/${v.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skuAnnonce: lu.sku }),
      });
      if (!res.ok) {
        toastErreur(`SKU non enregistré : ${await lireErreur(res)}`);
        setEtat("repos");
        return;
      }
      const j = (await res.json()) as { version: VersionEnBase };
      onVersionModifiee(j.version);
      setEtat("enregistre");
    } catch {
      toastErreur("Connexion perdue : le SKU n’a pas été enregistré.");
      setEtat("repos");
    }
  }

  const nom = nomVersion(v.numero).replace(" (actuelle)", "");
  async function copierTexte(texte: string, quoi: "titre" | "description") {
    if (await copier(texte)) toastSucces(quoi === "titre" ? `Titre de la ${nom} copié.` : `Description de la ${nom} copiée.`);
    else toastErreur("Copie refusée par le navigateur : sélectionne le texte à la main.");
  }

  const description = texteDescription({ tirets: v.description, motsCles: v.motsCles, sku });

  return (
    <div id="version-detail" role="tabpanel" aria-labelledby={`version-${v.numero}-onglet`} className="mt-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-baseline gap-2">
          <h3 className="text-md font-semibold text-ink">Photos de la version</h3>
          <span className="font-mono text-xs font-medium text-ink-2">{v.photos.length}</span>
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

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        <h3 className="text-md font-semibold text-ink">Texte de l’annonce</h3>
        {premiere && <span className="text-sm text-ink-3">La Version 1 est l’annonce actuelle du sac.</span>}
      </div>

      <div className="mt-3 grid grid-cols-1 items-start gap-4 min-[1100px]:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="rounded-md border border-line bg-surface-2 p-4">
          <div className="mb-2 flex items-center justify-between gap-2.5">
            <span className={LIBELLE}>Titre</span>
            <span className="flex items-center gap-2.5">
              <span className="font-mono text-xs text-ink-3">{v.titre.length} car.</span>
              <Button variant="secondary" size="sm" disabled={!v.titre} onClick={() => void copierTexte(v.titre, "titre")}>
                <Copy size={14} aria-hidden /> Copier le titre
              </Button>
            </span>
          </div>
          {v.titre ? (
            <p className="text-md font-bold text-ink">{v.titre}</p>
          ) : (
            <p className="text-base text-ink-3">Pas encore de titre : l’annonce de ce sac n’a pas été générée.</p>
          )}
        </div>

        <div className="rounded-md border border-line bg-surface-2 p-4">
          <div className="flex items-center justify-between gap-2.5">
            <span className={LIBELLE}>Description</span>
            <Button variant="secondary" size="sm" disabled={!description} onClick={() => void copierTexte(description, "description")}>
              <Copy size={14} aria-hidden /> Copier la description
            </Button>
          </div>
          <div className="mt-2 rounded-sm border border-line bg-surface-3 p-3 text-ink-3">
            <div className="mb-1.5 flex items-center justify-between gap-2.5">
              <span className="text-xs font-bold uppercase tracking-[0.05em]">Tirets</span>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
                <Lock size={14} aria-hidden /> Ne change jamais
              </span>
            </div>
            <p data-testid="version-tirets" className="whitespace-pre-line text-base leading-[1.6]" aria-readonly="true">
              {v.description || "Pas encore de description."}
            </p>
          </div>
          <div className="mt-2 rounded-sm border border-line bg-surface p-3">
            <span className={cn(LIBELLE, "mb-1.5 block")}>Mots-clés</span>
            <p data-testid="version-mots-cles" className={cn("text-base leading-[1.6]", v.motsCles ? "text-ink" : "text-ink-3")}>
              {v.motsCles || "Pas encore de mots-clés."}
            </p>
          </div>
          <div className="mt-2 rounded-sm border border-line bg-surface p-3">
            <div className="mb-1.5 flex items-center justify-between gap-2.5">
              <span className={LIBELLE}>Ligne SKU</span>
              <span className="text-xs text-ink-3">reprend la case SKU</span>
            </div>
            <p data-testid="version-ligne-sku" className={cn("font-mono text-base", sku ? "text-ink" : "text-ink-3")}>
              {sku ?? "SKU de l’annonce"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
