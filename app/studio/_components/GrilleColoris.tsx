"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CardTitle, Eyebrow, Frame, Module } from "@/components/console";
import { estDoublon } from "@/lib/studioFiche";
import type { DonneesGrille, LigneGrille } from "@/lib/studioServeur";
import { Badge, BandeauSacbase, champ } from "../_ui";

/**
 * La grille /studio. Filtre « doublons chez moi » coché par défaut : la spec
 * (§12) fait démarrer le test sur les sacs présents en double chez Aramis.
 */
export default function GrilleColoris({ donnees }: { donnees: DonneesGrille }) {
  const aDesDoublons = donnees.lignes.some((l) => l.chezMoi !== null && estDoublon(l.chezMoi));
  const [doublons, setDoublons] = useState(aDesDoublons);
  const [q, setQ] = useState("");

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return donnees.lignes.filter(
      (l) =>
        (!doublons || (l.chezMoi !== null && estDoublon(l.chezMoi))) &&
        (!t || `${l.modele} ${l.coloris} ${l.cle}`.toLowerCase().includes(t)),
    );
  }, [donnees.lignes, doublons, q]);

  const avecRefs = donnees.lignes.filter((l) => l.avancement.references > 0).length;

  return (
    <Frame>
      <BandeauSacbase etat={donnees.sacbase} />

      <Module className="p-[18px]">
        <div className="flex flex-wrap items-end gap-6">
          <div>
            <Eyebrow>COLORIS</Eyebrow>
            <div className="mt-1 text-[26px] font-bold tracking-[-0.02em]">{donnees.lignes.length}</div>
          </div>
          <div>
            <Eyebrow>AVEC PHOTOS</Eyebrow>
            <div className="mt-1 text-[26px] font-bold tracking-[-0.02em]">{avecRefs}</div>
          </div>
          <div>
            <Eyebrow>PHOTOS NON RATTACHÉES</Eyebrow>
            <div className="mt-1 text-[26px] font-bold tracking-[-0.02em]">{donnees.orphelines}</div>
          </div>
          {donnees.rattachees > 0 && (
            <p className="text-[13px] text-[var(--ink2)]">
              {donnees.rattachees} photo(s) rattachée(s) à leur coloris à l’instant.
            </p>
          )}
          <div className="ml-auto flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-[var(--ink2)]">
              <input
                type="checkbox"
                checked={doublons}
                onChange={(e) => setDoublons(e.target.checked)}
                className="h-4 w-4 accent-[var(--acc)]"
              />
              Doublons chez moi
            </label>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Chercher un coloris"
              aria-label="Chercher un coloris"
              className={`${champ} w-[220px]`}
            />
          </div>
        </div>
      </Module>

      {visibles.length === 0 ? (
        <Module>
          <p className="text-[14px] text-[var(--ink2)]">
            {donnees.lignes.length === 0
              ? "Aucun coloris : SacBase n’a rien renvoyé, et aucun coloris n’a encore été ouvert."
              : "Aucun coloris ne correspond au filtre."}
          </p>
        </Module>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-[14px]">
          {visibles.map((l) => (
            <CarteColoris key={l.cle} ligne={l} sacbaseUrl={donnees.sacbaseUrl} />
          ))}
        </div>
      )}
    </Frame>
  );
}

function CarteColoris({ ligne: l, sacbaseUrl }: { ligne: LigneGrille; sacbaseUrl: string | null }) {
  const [vignetteKo, setVignetteKo] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  // Une image en échec AVANT l'hydratation ne déclenche jamais onError côté
  // React : on relit son état au montage. (SacBase protège /img derrière sa
  // session : sans cookie SacBase dans ce navigateur, la vignette tombe ici.)
  useEffect(() => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth === 0) setVignetteKo(true);
  }, []);
  const aPhotographier = l.avancement.references === 0;
  const vignette = l.image && sacbaseUrl && !vignetteKo ? `${sacbaseUrl}/${l.image.replace(/^\/+/, "")}` : null;

  return (
    <Link
      href={`/studio/${encodeURIComponent(l.cle)}`}
      className={`group flex flex-col overflow-hidden rounded-[20px] border border-[var(--border)] bg-surface transition-colors hover:border-[var(--acc)] ${aPhotographier ? "opacity-60 hover:opacity-100" : ""}`}
    >
      <div className="flex aspect-[4/3] items-center justify-center bg-[var(--surface-2)]">
        {vignette ? (
          // Vignette du catalogue SacBase : un repère, jamais une référence de génération (spec §4).
          // eslint-disable-next-line @next/next/no-img-element
          <img ref={img} src={vignette} alt="" className="h-full w-full object-cover" onError={() => setVignetteKo(true)} />
        ) : (
          <span className="font-mono text-[11px] tracking-[0.1em] text-[var(--faint)]">{l.modele || "—"}</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <CardTitle className="mb-0" aside={l.modele}>
          {l.coloris || l.cle}
        </CardTitle>
        <div className="flex flex-wrap gap-1.5">
          {l.chezMoi !== null && (
            <Badge ton={estDoublon(l.chezMoi) ? "acc" : "neutre"} title={`${l.sacs ?? 0} sac(s) connus de SacBase`}>
              {l.chezMoi} CHEZ MOI{estDoublon(l.chezMoi) ? " · DOUBLON" : ""}
            </Badge>
          )}
          {aPhotographier ? (
            <Badge ton="warn">À PHOTOGRAPHIER</Badge>
          ) : (
            <Badge>{l.avancement.references} PHOTO{l.avancement.references > 1 ? "S" : ""}</Badge>
          )}
          {l.avancement.anglesTestes > 0 && (
            <Badge ton={l.avancement.anglesValides > 0 ? "pos" : "neutre"}>
              {l.avancement.anglesValides}/{l.avancement.anglesTestes} ANGLES OK
            </Badge>
          )}
          {l.avancement.scoreMoyen !== null && <Badge>SCORE {l.avancement.scoreMoyen}</Badge>}
        </div>
      </div>
    </Link>
  );
}
