// Les réglages de retouche d'une version, en une ligne lisible (PRD 2026-11-16,
// étape 4) : « Pivoté 8° (zoom) · Recadré 10 % · Cadre beige 4 %, bord adouci
// 35 % ». PUR et isomorphe : l'écran Versions et les tests lisent les mêmes
// fonctions. Les réglages viennent des copies (`StudioReference.retouche`, lue
// par `retoucheDeCopie`) ; la Version 1, qui montre les images de l'annonce
// actuelle, n'a pas de ligne.

import { COULEURS_CADRE, normaliserRetouche, cleRetouche, type Retouche } from "./studioRetouche";

export const TEXTE_ORIGINE = "Photos d’origine";
export const TEXTE_VARIES = "Réglages variés";
export const TEXTE_INCONNUS = "Réglages inconnus";

/** Le nom de la pastille (en minuscules, dans une phrase), ou le code d'une couleur libre : « beige », « #c4553a ». */
export function couleurLisible(hex: string): string {
  const h = hex.toLowerCase();
  const pastille = COULEURS_CADRE.find((c) => c.hex === h);
  return pastille ? pastille.nom.toLowerCase() : h;
}

/**
 * Les réglages d'UNE retouche, sans les réglages neutres :
 *   • pas de rotation à 0° ; sinon « Pivoté 8° (zoom) » ou « Pivoté −3° (bords blancs) » ;
 *   • pas de recadrage à 0 % ; sinon « Recadré 10 % » ;
 *   • cadre : « Cadre beige 4 %, bord adouci 35 % » (le bord adouci disparaît à 0),
 *     « Sans cadre » quand le cadre est éteint — mais seulement si autre chose a
 *     été réglé ;
 *   • rien de réglé du tout : « Photos d’origine ».
 */
export function texteRetouche(r: Retouche): string {
  const n = normaliserRetouche(r);
  const parts: string[] = [];
  if (n.angle !== 0) parts.push(`Pivoté ${n.angle < 0 ? "−" : ""}${Math.abs(n.angle)}° (${n.modeRotation === "bordsBlancs" ? "bords blancs" : "zoom"})`);
  if (n.recadragePct > 0) parts.push(`Recadré ${n.recadragePct} %`);
  if (n.cadre) {
    const adouci = n.cadre.adoucissement > 0 ? `, bord adouci ${n.cadre.adoucissement} %` : "";
    parts.push(`Cadre ${couleurLisible(n.cadre.couleur)} ${n.cadre.epaisseurPct} %${adouci}`);
  } else if (parts.length > 0) {
    parts.push("Sans cadre");
  }
  return parts.length > 0 ? parts.join(" · ") : TEXTE_ORIGINE;
}

/** « 1 », « 1, 2 », « 1 à 3 », « 1 à 3, 5 » : les numéros de photos, les suites de trois ou plus resserrées. */
export function listeNumeros(numeros: readonly number[]): string {
  const tries = [...numeros].sort((a, b) => a - b);
  const morceaux: string[] = [];
  for (let i = 0; i < tries.length; ) {
    let j = i;
    while (j + 1 < tries.length && tries[j + 1] === tries[j] + 1) j++;
    if (j - i >= 2) morceaux.push(`${tries[i]} à ${tries[j]}`);
    else for (let k = i; k <= j; k++) morceaux.push(String(tries[k]));
    i = j + 1;
  }
  return morceaux.join(", ");
}

export type LigneReglages = {
  texte: string;
  /** Les réglages photo par photo, quand ils diffèrent (le survol) ; null quand ils sont tous les mêmes. */
  detail: string | null;
};

/**
 * La ligne d'une version, d'après les réglages de chacune de ses photos, dans
 * l'ordre (`null` = copie dont les réglages ne se relisent pas). Une version
 * créée en un lot a les mêmes réglages sur toutes ses photos : la ligne les
 * dit. Si les photos diffèrent (les anciennes copies « Pivoter »), « Réglages
 * variés » et le détail, un réglage par ligne : « Photos 1 à 3 : Pivoté 8° (zoom) · Sans cadre ».
 * Une version sans photo n'a pas de ligne (null).
 */
export function ligneReglages(retouches: readonly (Retouche | null)[]): LigneReglages | null {
  if (retouches.length === 0) return null;
  const groupes = new Map<string, { texte: string; photos: number[] }>();
  retouches.forEach((r, i) => {
    const cle = r ? cleRetouche(r) : "?";
    const g = groupes.get(cle) ?? { texte: r ? texteRetouche(r) : TEXTE_INCONNUS, photos: [] };
    g.photos.push(i + 1);
    groupes.set(cle, g);
  });
  const liste = [...groupes.values()];
  if (liste.length === 1) return { texte: liste[0].texte, detail: null };
  return {
    texte: TEXTE_VARIES,
    detail: liste.map((g) => `${g.photos.length > 1 ? "Photos" : "Photo"} ${listeNumeros(g.photos)} : ${g.texte}`).join("\n"),
  };
}
