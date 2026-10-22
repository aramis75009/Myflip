// Studio IA : prompts préparés par MyFlip, générés par Aramis dans Gemini.
// Module pur : il ne produit que du texte (aucun appel réseau, base ou DOM).

export const ROLES_REFERENCE = ["face", "dos", "cote", "detail", "ouvert"] as const;
export type RoleReference = (typeof ROLES_REFERENCE)[number];

export const ROLE_LIBELLES: Record<RoleReference, string> = {
  face: "Face",
  dos: "Dos",
  cote: "Côté",
  detail: "Détail",
  ouvert: "Ouvert",
};

export type ModeleAngle = {
  nom: string;
  roleReference: RoleReference;
  /** Texte injecté dans {angle}. En anglais : c'est ce que comprend le modèle d'image. */
  angle: string;
  ordre: number;
};

export const SCENE_PAR_DEFAUT =
  "plain light grey studio backdrop, soft diffused daylight, no props, no people";

export const DETAILS_PAR_DEFAUT =
  "No specific detail listed: reproduce every logo, lettering, stitching and pattern visible on the reference photos exactly.";

// Les prompts du test manuel du 17/10 ne sont pas dans le dépôt : ce bloc et
// ces angles sont une réécriture, à ajuster dans le Studio après les premiers essais.
export const BLOC_COMMUN_PAR_DEFAUT = `Using the attached reference photos of this exact bag, generate a new product photo of the same bag from a different angle.

Angle: {angle}

Details to preserve exactly (same position, colour, size and shape as on the references):
{details}

Scene: {scene}

Keep the bag strictly identical to the references: same materials, same colours, same proportions. Do not invent, move or remove any logo, patch, lettering, pattern or stitching. Photorealistic product photography, portrait 3:4, the whole bag in frame unless the angle asks for a close-up.`;

export const ANGLES_AMORCAGE: ModeleAngle[] = [
  {
    nom: "Face",
    roleReference: "face",
    ordre: 1,
    angle:
      "front view, camera at the height of the bag and facing it straight on, the bag standing upright and centred, the whole bag visible.",
  },
  {
    nom: "Dos",
    roleReference: "dos",
    ordre: 2,
    angle:
      "back view, camera at the height of the bag and facing its back panel straight on, the bag standing upright and centred, the whole back panel visible.",
  },
  {
    nom: "Bretelles",
    roleReference: "dos",
    ordre: 3,
    angle:
      "back view, slightly from above, showing both shoulder straps lying flat against the back panel, with their padding, stitching and adjusters clearly visible.",
  },
  {
    nom: "Boucle",
    roleReference: "detail",
    ordre: 4,
    angle:
      "close-up of the main buckle and its strap, macro product shot, shallow depth of field, the buckle sharp and filling about half of the frame.",
  },
  {
    nom: "Profil",
    roleReference: "cote",
    ordre: 5,
    angle:
      "side view, camera at the height of the bag and facing one side panel straight on, showing the depth of the bag and the side pocket if there is one.",
  },
  {
    nom: "Patch",
    roleReference: "detail",
    ordre: 6,
    angle:
      "close-up of the patch and the lettering next to it, straight-on macro product shot, the patch sharp and centred, its embroidery and edges clearly readable.",
  },
  {
    nom: "Sac ouvert",
    roleReference: "ouvert",
    ordre: 7,
    angle:
      "three-quarter view from above, the main compartment unzipped and open, showing the lining and the inside pockets, the bag still standing upright.",
  },
];

const VARIABLE = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

/**
 * Remplace {nom} par valeurs[nom], en une seule passe.
 * - une variable absente de `valeurs` reste telle quelle (visible, donc repérable) ;
 * - une valeur contenant elle-même « {scene} » n'est pas réinterprétée ;
 * - les accolades qui ne forment pas un nom de variable (JSON, « {} ») ne sont pas touchées.
 */
export function substituer(texte: string, valeurs: Record<string, string>): string {
  return texte.replace(VARIABLE, (brut, nom: string) =>
    Object.prototype.hasOwnProperty.call(valeurs, nom) ? valeurs[nom] : brut,
  );
}

/**
 * Découpe la saisie « un détail par ligne » : lignes vides retirées, puces
 * (« - », « • », « * ») ôtées, doublons supprimés sans tenir compte de la casse.
 * Sert au prompt ET à la grille de vérification.
 */
export function detailsEnLignes(saisie: string | readonly string[]): string[] {
  const lignes = typeof saisie === "string" ? saisie.split(/\r?\n/) : saisie;
  const vus = new Set<string>();
  const out: string[] = [];
  for (const brute of lignes) {
    const ligne = brute.replace(/^\s*[-•*]\s+/, "").trim();
    if (!ligne) continue;
    const cle = ligne.toLowerCase();
    if (vus.has(cle)) continue;
    vus.add(cle);
    out.push(ligne);
  }
  return out;
}

function listeAPuces(lignes: string[]): string {
  return lignes.map((l) => `- ${l}`).join("\n");
}

export type EntreesPrompt = {
  /** Bloc commun éditable ; à défaut, BLOC_COMMUN_PAR_DEFAUT. */
  bloc?: string;
  angle: string;
  /** Détails du coloris : la saisie brute (un par ligne) ou déjà découpés. */
  details: string | readonly string[];
  scene?: string;
};

export function compilerPrompt({ bloc, angle, details, scene }: EntreesPrompt): string {
  const lignes = detailsEnLignes(details);
  return substituer(bloc ?? BLOC_COMMUN_PAR_DEFAUT, {
    angle: angle.trim(),
    details: lignes.length > 0 ? listeAPuces(lignes) : DETAILS_PAR_DEFAUT,
    scene: scene?.trim() || SCENE_PAR_DEFAUT,
  });
}

/**
 * Prompt de correction ciblée, à recoller dans la même conversation Gemini.
 * Renvoie null s'il n'y a aucun détail à corriger : l'écran désactive alors le bouton.
 */
export function compilerCorrection(detailsDerivants: string | readonly string[]): string | null {
  const lignes = detailsEnLignes(detailsDerivants);
  if (lignes.length === 0) return null;
  return `Keep everything identical, but fix ${lignes.length === 1 ? "this detail" : "these details"} so that ${lignes.length === 1 ? "it matches" : "they match"} the reference photos exactly:
${listeAPuces(lignes)}

Do not change the angle, framing, lighting, background or any other part of the bag.`;
}
