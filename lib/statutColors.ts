// Status colours, on the design tokens of app/tokens.css (`--st-<key>`,
// `--st-<key>-ink`, `--st-<key>-soft`, both themes).
//
// - `repere` (dot, rule, donut segment, chip dot): decorative, the status
//   label is always written next to it (WCAG 1.4.1);
// - `texte`: the status written in its colour (≥ 4.5:1 on surface, surface-2
//   and bg, checked by lib/designTokens.test.ts);
// - `pastille`: filled read-only badge (soft background + ink text).
//
// Class strings are written IN FULL below: Tailwind only compiles classes it
// can read literally in the sources (lib/ is in its `content`).

export type CleStatut =
  | "brouillon"
  | "stock"
  | "lavage"
  | "repasse"
  | "photos"
  | "vente"
  | "livraison"
  | "compta"
  | "vendu"
  | "perdu";

const CLES: Record<string, CleStatut> = {
  Brouillon: "brouillon",
  "En stock": "stock",
  "En lavage": "lavage",
  "Repassé": "repasse",
  "Photos prêtes": "photos",
  "En vente": "vente",
  "En livraison": "livraison",
  "À comptabiliser": "compta",
  Vendu: "vendu",
  Perdu: "perdu",
};

/** Token key of a status; an unknown status reads as « Brouillon ». */
export function cleStatut(statut: string): CleStatut {
  return CLES[statut] ?? "brouillon";
}

export type StyleStatut = {
  cle: CleStatut;
  /** Filled badge: soft background + ink text. */
  pastille: string;
  /** Text in the status colour. */
  texte: string;
  /** Background of a dot / marker. */
  repere: string;
  /** Border in the status colour. */
  trait: string;
  /** SVG fill. */
  remplissage: string;
};

const STYLES: Record<CleStatut, Omit<StyleStatut, "cle">> = {
  brouillon: {
    pastille: "bg-st-brouillon-soft text-st-brouillon-ink",
    texte: "text-st-brouillon-ink",
    repere: "bg-st-brouillon",
    trait: "border-st-brouillon",
    remplissage: "fill-st-brouillon",
  },
  stock: {
    pastille: "bg-st-stock-soft text-st-stock-ink",
    texte: "text-st-stock-ink",
    repere: "bg-st-stock",
    trait: "border-st-stock",
    remplissage: "fill-st-stock",
  },
  lavage: {
    pastille: "bg-st-lavage-soft text-st-lavage-ink",
    texte: "text-st-lavage-ink",
    repere: "bg-st-lavage",
    trait: "border-st-lavage",
    remplissage: "fill-st-lavage",
  },
  repasse: {
    pastille: "bg-st-repasse-soft text-st-repasse-ink",
    texte: "text-st-repasse-ink",
    repere: "bg-st-repasse",
    trait: "border-st-repasse",
    remplissage: "fill-st-repasse",
  },
  photos: {
    pastille: "bg-st-photos-soft text-st-photos-ink",
    texte: "text-st-photos-ink",
    repere: "bg-st-photos",
    trait: "border-st-photos",
    remplissage: "fill-st-photos",
  },
  vente: {
    pastille: "bg-st-vente-soft text-st-vente-ink",
    texte: "text-st-vente-ink",
    repere: "bg-st-vente",
    trait: "border-st-vente",
    remplissage: "fill-st-vente",
  },
  livraison: {
    pastille: "bg-st-livraison-soft text-st-livraison-ink",
    texte: "text-st-livraison-ink",
    repere: "bg-st-livraison",
    trait: "border-st-livraison",
    remplissage: "fill-st-livraison",
  },
  compta: {
    pastille: "bg-st-compta-soft text-st-compta-ink",
    texte: "text-st-compta-ink",
    repere: "bg-st-compta",
    trait: "border-st-compta",
    remplissage: "fill-st-compta",
  },
  vendu: {
    pastille: "bg-st-vendu-soft text-st-vendu-ink",
    texte: "text-st-vendu-ink",
    repere: "bg-st-vendu",
    trait: "border-st-vendu",
    remplissage: "fill-st-vendu",
  },
  perdu: {
    pastille: "bg-st-perdu-soft text-st-perdu-ink",
    texte: "text-st-perdu-ink",
    repere: "bg-st-perdu",
    trait: "border-st-perdu",
    remplissage: "fill-st-perdu",
  },
};

/** Tailwind classes of a status (see the header comment for each role). */
export function styleStatut(statut: string): StyleStatut {
  const cle = cleStatut(statut);
  return { cle, ...STYLES[cle] };
}

// ── Compatibility until lot LZ (inline styles of screens not migrated yet) ──

export type StatutColor = { color: string; bg: string; ink: string };

const enLigne = (cle: CleStatut): StatutColor => ({
  color: `rgb(var(--st-${cle}))`,
  bg: `rgb(var(--st-${cle}-soft))`,
  ink: `rgb(var(--st-${cle}-ink))`,
});

/** @deprecated Use `styleStatut` (classes). Kept until lot LZ. */
export const STATUT_COLORS: Record<string, StatutColor> = Object.fromEntries(
  Object.entries(CLES).map(([statut, cle]) => [statut, enLigne(cle)]),
);

/** @deprecated Use `styleStatut` (classes). Kept until lot LZ. */
export function statutColor(statut: string): StatutColor {
  return enLigne(cleStatut(statut));
}

/** @deprecated Use `styleStatut(statut).repere`. Kept until lot LZ. */
export function statutMarker(statut: string): string {
  return `rgb(var(--st-${cleStatut(statut)}))`;
}
