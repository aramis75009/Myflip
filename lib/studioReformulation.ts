// « Reformuler » (PRD 2026-11-16, §2, §8, §10, §11) : les règles, sans base ni
// réseau. Isomorphe : l'écran (diff mot à mot), la route et les tests lisent
// les mêmes fonctions.
//
// Ce que fait la reformulation : à partir du titre et des mots-clés ENREGISTRÉS
// d'une version (Version 2 et suivantes), l'IA propose un nouveau titre et des
// mots-clés légèrement changés. Rien n'est enregistré ici : la proposition
// s'affiche, et seul « Garder » écrit (un `PATCH` de `titre` et `motsCles`).
//
// ⚠️ Jamais touchés, jamais envoyés à modifier : `description` (les tirets) et
// `skuAnnonce`. L'IA ne les voit pas, et ce qu'elle renverrait sous le nom
// « description » (le format de réponse d'annonce l'exige) est jeté.

import { decouperMotsCles, estVersionUn, longueurTitre, normaliserMotsCles, normaliserTitre, TITRE_MAX, viseVersionUn, MESSAGE_VERSION_UN } from "./studioVersion";

/** Ce que l'IA propose, et ce qu'on enregistre si Aramis garde : rien d'autre. */
export type Proposition = { titre: string; motsCles: string };

export const MESSAGE_INUTILISABLE = "Proposition inutilisable, réessaie";

// ── Différence mot à mot ────────────────────────────────────────────────────

/** Un mot (ou un mot-clé entier) de la NOUVELLE version, et s'il a changé. */
export type MotDiff = { texte: string; change: boolean };

/**
 * Les mots de `apres`, chacun marqué `change` s'il n'est pas dans `avant`.
 * Plus longue sous-suite commune (comme `diff`) : un mot déplacé hors de la
 * suite commune compte pour changé ; un mot identique resté à sa place, non.
 * Comparaison exacte, casse comprise : « Nike » devenu « nike » est un changement.
 */
export function diffMots(avant: readonly string[], apres: readonly string[]): MotDiff[] {
  const n = avant.length;
  const m = apres.length;
  // d[i][j] : longueur de la plus longue sous-suite commune de avant[i..] et apres[j..].
  const d: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      d[i][j] = avant[i] === apres[j] ? d[i + 1][j + 1] + 1 : Math.max(d[i + 1][j], d[i][j + 1]);
    }
  }
  const change = new Array<boolean>(m).fill(true);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (avant[i] === apres[j]) {
      change[j] = false;
      i++;
      j++;
    } else if (d[i + 1][j] >= d[i][j + 1]) i++;
    else j++;
  }
  return apres.map((texte, k) => ({ texte, change: change[k] }));
}

const motsDuTitre = (s: string): string[] => s.split(/\s+/).filter(Boolean);

/** Le titre proposé, mot à mot (séparés par une espace) contre l'ancien. */
export const diffTitre = (avant: string, apres: string): MotDiff[] => diffMots(motsDuTitre(avant), motsDuTitre(apres));

/** Les mots-clés proposés, un mot-clé entier à la fois (séparés par une virgule) contre les anciens. */
export const diffMotsCles = (avant: string, apres: string): MotDiff[] => diffMots(decouperMotsCles(avant), decouperMotsCles(apres));

export const nbChanges = (segments: readonly MotDiff[]): number => segments.filter((s) => s.change).length;

// ── Le prompt ───────────────────────────────────────────────────────────────

/**
 * Le prompt envoyé à l'IA. Il ne reçoit que le titre et les mots-clés : ni les
 * tirets, ni le SKU. Les trois clés de réponse (`titre`, `description`,
 * `motsCles`) sont celles que les clients d'annonce imposent (`lib/openrouter.ts`,
 * `lib/ollama.ts`, `lib/anthropic.ts`) : « description » est donc demandée, mais
 * sans objet, et jetée à la lecture.
 */
export function promptReformulation({ titre, motsCles }: Proposition): string {
  return `Tu retouches très légèrement une annonce Vinted (vêtements ou sacs d'occasion) qui existe déjà. Tu ne la réécris pas : tu en proposes une variante très proche, de même sens.

TITRE ACTUEL
${titre}

MOTS-CLÉS ACTUELS (une chaîne, séparés par des virgules)
${motsCles}

CE QUE TU FAIS
- Titre : un nouveau titre de même sens, en remplaçant seulement quelques mots par des équivalents (ou en changeant légèrement leur ordre).
- Mots-clés : la même liste, en remplaçant seulement quelques mots-clés par des équivalents de même sens. Tous les autres restent identiques, mot pour mot.

RÈGLES IMPÉRATIVES
1. GARDE LES FAITS tels qu'ils sont écrits : la marque et le modèle (même orthographe, même casse), le coloris, la taille, l'état, la matière, les chiffres et les références. Ne les traduis pas, ne les remplace pas, ne les reformule pas.
2. N'AJOUTE RIEN DE FAUX : aucune information, aucun défaut, aucune matière, aucune mesure, aucune marque, aucun usage qui ne figure pas déjà dans le titre ou les mots-clés actuels. Dans le doute, laisse le mot tel quel.
3. Le titre fait ${TITRE_MAX} caractères au maximum, espaces compris : jamais un de plus. Il garde le style du titre actuel (majuscules, séparateurs, ponctuation, pas d'émoji).
4. Chaque mot-clé remplacé reste dans SA langue : un mot-clé allemand est remplacé par un mot-clé allemand, un italien par un italien, un anglais par un anglais, un français par un français, et ainsi de suite. Ne traduis jamais un mot-clé dans une autre langue.
5. Les mots-clés gardent le même format : UNE seule chaîne, séparés par des virgules, avec à peu près le même nombre de mots-clés qu'avant. Pas de doublon, pas de liste à puces, pas de retour à la ligne.
6. Aucun commentaire, aucune explication, aucun préambule.

CLÉ « description » DE LA RÉPONSE
Le format de réponse impose cette clé, mais elle ne sert à rien ici : mets-y exactement « Sans objet. ». Elle est ignorée.`;
}

// ── La proposition rendue par l'IA ──────────────────────────────────────────

/**
 * Lit ce que l'IA a rendu : un titre non vide de 100 caractères au plus, des
 * mots-clés non vides (une chaîne séparée par des virgules ; un tableau est
 * tolérée et recollée). Seuls `titre` et `motsCles` sont lus : `description`,
 * `skuAnnonce` ou toute autre clé sont ignorés, jamais recopiés.
 */
export function lireProposition(sortie: unknown): { ok: true; proposition: Proposition } | { ok: false; raison: string } {
  if (!sortie || typeof sortie !== "object" || Array.isArray(sortie)) return { ok: false, raison: "réponse illisible" };
  const s = sortie as Record<string, unknown>;

  if (typeof s.titre !== "string") return { ok: false, raison: "titre absent" };
  const titre = normaliserTitre(s.titre);
  if (!titre) return { ok: false, raison: "titre vide" };
  const n = longueurTitre(titre);
  if (n > TITRE_MAX) return { ok: false, raison: `titre trop long : ${n} caractères` };

  const brut = Array.isArray(s.motsCles) ? s.motsCles.filter((m): m is string => typeof m === "string").join(",") : s.motsCles;
  if (typeof brut !== "string") return { ok: false, raison: "mots-clés absents" };
  const motsCles = normaliserMotsCles(brut);
  if (!motsCles) return { ok: false, raison: "mots-clés vides" };

  return { ok: true, proposition: { titre, motsCles } };
}

/**
 * Le corps du `PATCH` de « Garder » : le titre et les mots-clés, RIEN d'autre,
 * même si l'objet reçu porte d'autres clés.
 */
export const corpsGarder = (p: Proposition): Proposition => ({ titre: p.titre, motsCles: p.motsCles });

// ── Les erreurs de l'appel IA ───────────────────────────────────────────────

/**
 * Une erreur de `genererAnnonce` est-elle une SORTIE inutilisable du modèle
 * (JSON illisible, champ vide, titre trop long, refus du modèle) ? Alors
 * l'écran dit « Proposition inutilisable, réessaie ». Sinon (clé manquante ou
 * refusée, crédits épuisés, fournisseur injoignable) le message du fournisseur,
 * déjà sans secret, est plus utile et passe tel quel.
 *
 * Les motifs sont les messages réels des trois clients (`lib/openrouter.ts`,
 * `lib/ollama.ts`, `lib/anthropic.ts`) ; `lib/studioReformulation.test.ts` les
 * rejoue contre eux.
 */
export function sortieInutilisable(message: string): boolean {
  return /^Réponse (?:vide|incomplète|illisible|du modèle non-JSON)|n'a pas rendu une annonce valide|a décliné cette demande|Titre trop long/i.test(
    message,
  );
}

// ── L'orchestration ─────────────────────────────────────────────────────────

/** Ce que la route a besoin de savoir d'une version pour la reformuler. */
export type VersionAReformuler = { numero: number; titre: string; motsCles: string };

/** Ce que l'IA rend : les trois clés du format d'annonce. Seules deux sont lues. */
export type SortieIA = { titre?: unknown; description?: unknown; motsCles?: unknown };

/**
 * Les deux dépendances de la route. AUCUNE ne sait écrire : `lireVersion` lit,
 * `demanderIA` interroge le fournisseur du compte. Une reformulation ne peut
 * donc rien enregistrer par elle-même.
 */
export type DepsReformulation = {
  /** La version du compte (scopée par `userId`), ou null. */
  lireVersion: (id: string) => Promise<VersionAReformuler | null>;
  /** UN appel au fournisseur IA du compte : prompt → réponse brute. Lève en cas d'échec. */
  demanderIA: (prompt: string) => Promise<SortieIA>;
};

export type CodeRefusReformulation = "version_une" | "introuvable" | "rien_a_reformuler" | "proposition_inutilisable" | "ia_indisponible";

export type ResultatReformulation =
  | { ok: true; proposition: Proposition }
  | { ok: false; code: CodeRefusReformulation; message: string; raison?: string };

const refus = (code: CodeRefusReformulation, message: string, raison?: string): ResultatReformulation => ({ ok: false, code, message, raison });

/**
 * Reformule le titre et les mots-clés d'une version : UN appel IA par appel de
 * cette fonction, jamais sans elle.
 *
 *   - la Version 1 (pas d'id, ou numéro 1) est refusée AVANT tout appel ;
 *   - une version introuvable ou d'un autre compte n'appelle pas l'IA ;
 *   - sans titre ou sans mots-clés enregistrés, il n'y a rien à reformuler ;
 *   - une sortie inutilisable (JSON illisible, titre trop long, mots-clés
 *     vides) donne `proposition_inutilisable` : rien n'est enregistré.
 */
export async function reformulerVersion(deps: DepsReformulation, entree: { versionId: string | null | undefined }): Promise<ResultatReformulation> {
  if (viseVersionUn(entree.versionId)) return refus("version_une", MESSAGE_VERSION_UN);
  const version = await deps.lireVersion(entree.versionId as string);
  if (!version) return refus("introuvable", "Version introuvable : recharge la page.");
  if (estVersionUn(version)) return refus("version_une", MESSAGE_VERSION_UN);

  const titre = normaliserTitre(version.titre);
  const motsCles = normaliserMotsCles(version.motsCles);
  if (!titre || !motsCles) return refus("rien_a_reformuler", "Renseigne d’abord le titre et les mots-clés de cette version : il n’y a rien à reformuler.");

  let sortie: SortieIA;
  try {
    sortie = await deps.demanderIA(promptReformulation({ titre, motsCles }));
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (sortieInutilisable(message)) return refus("proposition_inutilisable", MESSAGE_INUTILISABLE, message);
    return refus("ia_indisponible", message.slice(0, 300) || "L’IA n’a pas répondu : réessaie.");
  }

  const lue = lireProposition(sortie);
  if (!lue.ok) return refus("proposition_inutilisable", MESSAGE_INUTILISABLE, lue.raison);
  return { ok: true, proposition: lue.proposition };
}
