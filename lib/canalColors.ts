// design-tokens-dette: R4 → L3
// Couleurs des canaux de vente en HEX (styles inline) — même approche que
// statutColors : pas de classes Tailwind dynamiques (non compilées par le JIT).
export type CanalColor = { bg: string; text: string };

export const CANAUX = [
  "Vinted",
  "Vinted Go",
  "Vestiaire Collective",
  "Leboncoin",
  "En main propre",
  "Autre",
] as const;

export type Canal = (typeof CANAUX)[number];

export const CANAL_COLORS: Record<string, CanalColor> = {
  Vinted: { bg: "#0096FF", text: "#FFFFFF" },
  "Vinted Go": { bg: "#0047AB", text: "#FFFFFF" },
  "Vestiaire Collective": { bg: "#F97316", text: "#000000" },
  Leboncoin: { bg: "#FF6B35", text: "#FFFFFF" },
  "En main propre": { bg: "#6B7280", text: "#FFFFFF" },
  Autre: { bg: "#E5E7EB", text: "#374151" },
};

export function canalColor(canal: string): CanalColor {
  return CANAL_COLORS[canal] ?? CANAL_COLORS.Autre;
}
