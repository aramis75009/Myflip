// design-tokens-dette: R4 → L3
// Couleurs de statut en HEX (styles inline) — PAS de classes Tailwind dynamiques,
// car le JIT de Tailwind ne les compile pas en production (Vercel).
//
// `color` est LA couleur du statut, relevée sur la maquette « Direction C —
// Console ». C'est elle qui doit servir partout où un statut se signale :
// filet de la colonne SKU, pastille des chips, texte du sélecteur de statut,
// segments et légende du donut des Statistiques. Une seule valeur par statut,
// pour que le même statut ait la même couleur d'un écran à l'autre.
//
// `bg` / `ink` ne servent QUE au badge plein pastel (StatutBadge, modal de
// détail) : un aplat de `color` avec du texte dessus ne serait pas lisible.
//
// Réserve assumée : ces teintes ont été calibrées pour le fond graphite du
// thème sombre. Posées en texte sur le fond clair, elles plafonnent entre
// 1,7:1 et 2,9:1 de contraste, là où WCAG AA en demande 4,5:1. C'est un choix
// explicite du produit (fidélité à la maquette) ; le libellé du statut reste
// toujours doublé par un repère de forme ou de position, jamais porté par la
// seule couleur.
export type StatutColor = { color: string; bg: string; ink: string };

export const STATUT_COLORS: Record<string, StatutColor> = {
  Brouillon:         { color: "#9AA79F", bg: "#F1F4EF", ink: "#71807A" },
  "En stock":        { color: "#D8B23A", bg: "#FCF3CF", ink: "#8A6D0F" },
  // Photos prêtes = rose : jalon photo, distinct des voisins (jaune / bleu).
  "Photos prêtes":   { color: "#E58CB4", bg: "#FBEAF1", ink: "#BE4B7E" },
  "En vente":        { color: "#6FA8FF", bg: "#E7F0FF", ink: "#3B6FD4" },
  "En livraison":    { color: "#D9A94E", bg: "#FBF3E2", ink: "#B5872E" },
  "À comptabiliser": { color: "#F09068", bg: "#FBEEE7", ink: "#C2603F" },
  // Littéraux et non var(--acc*) : cette table doit rester une paire pastel
  // stable, indépendante de l'accent (qui vire au lime en thème sombre).
  Vendu:             { color: "#5FD39B", bg: "#EAF3ED", ink: "#1B4332" },
  // En lavage = magenta. C'était un cyan (#4FC8D4) : à la taille d'une pastille
  // de 8px (légende du donut, chips du Stock), il ne se distinguait plus du
  // vert de « Vendu » — 36° de teinte d'écart mais la même clarté. Le magenta
  // occupe le seul vrai creux de la roue (entre l'indigo 248° de « Repassé » et
  // le rose 335° de « Photos prêtes »), à ~45° de chacun.
  "En lavage":       { color: "#C44FD0", bg: "#FAE8FB", ink: "#A32FAD" },
  // Repassé = jalon franchi après le lavage. Indigo doux : assez proche du
  // magenta du lavage pour dire « même étape de remise en état », assez
  // distinct (46° de teinte, 18 points de clarté) pour ne pas s'y confondre —
  // ni avec le bleu de « En vente ».
  "Repassé":         { color: "#9A8FEA", bg: "#EDEBFB", ink: "#5B4FBE" },
  Perdu:             { color: "#8695A0", bg: "#ECEEF0", ink: "#2B3942" },
};

const FALLBACK: StatutColor = {
  color: "#9AA79F",
  bg: "#EEF1ED",
  ink: "#71807A",
};

export function statutColor(statut: string): StatutColor {
  return STATUT_COLORS[statut] ?? FALLBACK;
}

/** La couleur du statut. À préférer partout sauf sur le badge plein pastel. */
export function statutMarker(statut: string): string {
  return (STATUT_COLORS[statut] ?? FALLBACK).color;
}
