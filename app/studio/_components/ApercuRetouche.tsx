"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { geometrieRetouche, masqueAdoucissement, rgbDe, styleApercu, type Retouche } from "@/lib/studioRetouche";

/** Largeur, en pixels, du calque de bord adouci de l'aperçu (étiré par CSS ; le flou est lisse). */
const RESOLUTION_CALQUE = 360;

/**
 * Live preview of a retouch on one stored photo, client side only. The numbers
 * come from `geometrieRetouche`, the very function the server renders with
 * (lib/studioPivotRendu.ts): CSS for the frame, the crop and the rotation, and
 * a canvas for the soft edge, drawn from the same mask (`masqueAdoucissement`).
 * What is saved is what is seen.
 */
export default function ApercuRetouche({
  src,
  alt,
  retouche,
  pastille,
}: {
  src: string;
  alt: string;
  retouche: Retouche;
  /** Small label in the bottom-left corner (« 01 »). Not part of the saved image. */
  pastille?: string;
}) {
  // Natural size of the stored image: the preview takes its ratio. Until it is known, 3 : 4 (the Studio's format).
  const [taille, setTaille] = useState<{ l: number; h: number }>({ l: 600, h: 800 });
  const geo = useMemo(() => geometrieRetouche(taille.l, taille.h, retouche), [taille, retouche]);
  const style = styleApercu(geo);

  return (
    <div
      data-testid="apercu-retouche"
      className="relative overflow-hidden rounded-xs outline outline-1 -outline-offset-1 outline-line"
      style={{ aspectRatio: style.conteneur.aspectRatio, background: style.conteneur.background, containerType: "inline-size" }}
    >
      <div className="absolute overflow-hidden" style={{ inset: style.interieur.inset, background: style.interieur.background }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- image privée servie par /api/studio/image */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          onLoad={(e) => {
            const { naturalWidth: l, naturalHeight: h } = e.currentTarget;
            if (l > 0 && h > 0 && (l !== taille.l || h !== taille.h)) setTaille({ l, h });
          }}
          className="absolute max-w-none select-none"
          style={{ ...style.image, transformOrigin: "center" }}
        />
        {geo.adoucissement && geo.couleurCadre && (
          <CalqueAdouci
            ratio={geo.interieur.hauteur / geo.interieur.largeur}
            etalement={geo.adoucissement.etalementPx / geo.interieur.largeur}
            sigma={geo.adoucissement.sigmaPx / geo.interieur.largeur}
            couleur={geo.couleurCadre}
          />
        )}
      </div>
      {pastille && (
        <span className="absolute bottom-1.5 left-1.5 rounded-xs bg-surface px-1.5 font-mono text-xs font-semibold text-ink">{pastille}</span>
      )}
    </div>
  );
}

/** The soft edge: the frame colour over the photo, opacity from the shared mask, at a reduced resolution. */
function CalqueAdouci({ ratio, etalement, sigma, couleur }: { ratio: number; etalement: number; sigma: number; couleur: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const largeur = RESOLUTION_CALQUE;
  const hauteur = Math.max(1, Math.round(RESOLUTION_CALQUE * ratio));
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    // Lengths are given as a fraction of the zone width: scaled to the canvas, the mask is the server's, smaller.
    const masque = masqueAdoucissement(largeur, hauteur, etalement * largeur, sigma * largeur);
    const { r, g, b } = rgbDe(couleur);
    const image = ctx.createImageData(largeur, hauteur);
    for (let i = 0; i < masque.length; i++) {
      image.data[i * 4] = r;
      image.data[i * 4 + 1] = g;
      image.data[i * 4 + 2] = b;
      image.data[i * 4 + 3] = masque[i];
    }
    ctx.putImageData(image, 0, 0);
  }, [largeur, hauteur, etalement, sigma, couleur]);
  return <canvas ref={ref} width={largeur} height={hauteur} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />;
}
