// Validation des prompts du Studio (onglet Studio de /parametres). Pur.

export const LONGUEUR_MAX_NOM = 60;
export const LONGUEUR_MAX_ANGLE = 1000;
export const LONGUEUR_MAX_MAITRE = 6000;

export type SaisieAngle = { nom: string; angle: string };

/** Nom court et texte d'un prompt d'angle, validés et nettoyés. */
export function lireSaisieAngle(body: unknown): SaisieAngle | { erreur: string } {
  const b = (typeof body === "object" && body !== null ? body : {}) as { nom?: unknown; angle?: unknown };
  const nom = typeof b.nom === "string" ? b.nom.trim() : "";
  const angle = typeof b.angle === "string" ? b.angle.trim() : "";
  if (!nom) return { erreur: "Nom court requis." };
  if (nom.length > LONGUEUR_MAX_NOM) return { erreur: `Nom court : ${LONGUEUR_MAX_NOM} caractères au plus.` };
  if (!angle) return { erreur: "Texte du prompt d'angle requis." };
  if (angle.length > LONGUEUR_MAX_ANGLE) return { erreur: `Prompt d'angle : ${LONGUEUR_MAX_ANGLE} caractères au plus.` };
  return { nom, angle };
}

/** Le prompt maître, validé. Vide autorisé : le Studio n'envoie alors que le prompt d'angle. */
export function lirePromptMaitreSaisi(body: unknown): string | { erreur: string } {
  const v = (typeof body === "object" && body !== null ? (body as { promptMaitre?: unknown }).promptMaitre : undefined);
  if (typeof v !== "string") return { erreur: "Prompt maître illisible." };
  const t = v.trim();
  if (t.length > LONGUEUR_MAX_MAITRE) return { erreur: `Prompt maître : ${LONGUEUR_MAX_MAITRE} caractères au plus.` };
  return t;
}
