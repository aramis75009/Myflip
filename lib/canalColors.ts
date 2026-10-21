// Sales channels and their colours, on the design tokens of app/tokens.css
// (`--ch-<key>`, both themes). A channel is shown as a square marker followed
// by its name in ink: never white text on a filled chip, and never the colour
// alone. Class strings are written in full (Tailwind reads them literally).

export const CANAUX = [
  "Vinted",
  "Vinted Go",
  "Vestiaire Collective",
  "Leboncoin",
  "En main propre",
  "Autre",
] as const;

export type Canal = (typeof CANAUX)[number];

export type CleCanal = "vinted" | "vinted-go" | "vc" | "lbc" | "mp" | "autre";

const CLES: Record<string, CleCanal> = {
  Vinted: "vinted",
  "Vinted Go": "vinted-go",
  "Vestiaire Collective": "vc",
  Leboncoin: "lbc",
  "En main propre": "mp",
  Autre: "autre",
};

/** Token key of a channel; an unknown channel reads as « Autre ». */
export function cleCanal(canal: string): CleCanal {
  return CLES[canal] ?? "autre";
}

const REPERES: Record<CleCanal, string> = {
  vinted: "bg-ch-vinted",
  "vinted-go": "bg-ch-vinted-go",
  vc: "bg-ch-vc",
  lbc: "bg-ch-lbc",
  mp: "bg-ch-mp",
  autre: "bg-ch-autre",
};

/** Tailwind classes of a channel: `repere` = background of its square marker. */
export function styleCanal(canal: string): { repere: string } {
  return { repere: REPERES[cleCanal(canal)] };
}

// ── Compatibility until lot LZ (inline styles of screens not migrated yet) ──

export type CanalColor = { bg: string; text: string };

/** @deprecated Use `styleCanal` (classes). Kept until lot LZ. */
export function canalColor(canal: string): CanalColor {
  return { bg: `rgb(var(--ch-${cleCanal(canal)}))`, text: "rgb(var(--ink))" };
}
