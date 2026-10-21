"use client";
// design-tokens-dette: R4 → L3

import { ChevronDown } from "lucide-react";
import { STATUTS } from "@/lib/calc";
import { statutColor } from "@/lib/statutColors";

// Sélecteur de statut présenté comme une pastille.
//
// C'est bien un <select> natif sous le capot, et c'est délibéré : la liste
// déroulante native s'affiche hors du flux DOM. Un menu custom serait rogné
// par le conteneur virtualisé du Stock, et perdrait la navigation clavier
// ainsi que le sélecteur natif sur mobile.
// Ce qui change : `appearance: none` retire le chevron système (le seul
// contrôle brut visible de la page).
//
// Fond neutre, teinte portée par le texte — et non aplat pastel : depuis que
// la colonne SKU porte un filet à la couleur du statut, un pastel ici
// répétait l'information en aplat et faisait dix bandes de couleur par écran.
//
// LARGEUR FIXE, et c'est le point important. Une version précédente mesurait
// chaque pastille sur son propre libellé via un gabarit invisible, pour
// obtenir des badges qui se resserrent sur leur texte. La maquette Direction C
// fait l'inverse : les pastilles y font toutes exactement 140px (mesuré), soit
// une colonne de contrôles alignée, pas des badges de largeurs inégales. Le
// gabarit produisait en prime une troncature (« En ve… ») dès qu'on ajoutait
// une bordure au select sans la répercuter sur lui.

const SM_W = 140; // px — largeur relevée sur la maquette, cale « À comptabiliser »

type Props = {
  value: string;
  onChange: (statut: string) => void;
  /**
   * "sm" = ligne du tableau desktop : 32px de haut, 140px de large.
   * "md" = carte mobile : 44px, pleine largeur (cibles tactiles Apple HIG).
   */
  size?: "sm" | "md";
  ariaLabel?: string;
  className?: string;
};

export default function StatutPill({
  value,
  onChange,
  size = "sm",
  ariaLabel,
  className = "",
}: Props) {
  const c = statutColor(value);
  const md = size === "md";

  return (
    <span
      className={`relative inline-flex items-center ${md ? "h-11 w-full" : "h-8"} ${className}`}
      style={md ? undefined : { width: SM_W }}
    >
      <select
        value={value}
        aria-label={ariaLabel}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChange(e.target.value)}
        style={{
          color: c.color,
          WebkitAppearance: "none",
        }}
        className={`peer absolute inset-0 h-full w-full cursor-pointer appearance-none truncate rounded-full border border-line bg-surface-2 font-semibold leading-none outline-none transition-colors hover:border-line-strong focus-visible:ring-2 focus-visible:ring-focus ${
          md ? "pl-4 pr-9 text-sm" : "pl-2.5 pr-7 text-xs"
        }`}
      >
        {STATUTS.map((s) => (
          <option
            key={s}
            value={s}
            style={{ backgroundColor: "#ffffff", color: "#1a1c1c" }}
          >
            {s}
          </option>
        ))}
      </select>

      {/* Chevron discret, appuyé au survol : signale que c'est un contrôle
          sans imposer le rendu système. */}
      <ChevronDown
        aria-hidden="true"
        strokeWidth={2.75}
        style={{ color: c.color }}
        className={`pointer-events-none absolute opacity-45 transition-opacity peer-hover:opacity-90 peer-focus-visible:opacity-90 ${
          md ? "right-3 h-4 w-4" : "right-2.5 h-3 w-3"
        }`}
      />
    </span>
  );
}
