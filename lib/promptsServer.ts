// Helpers serveur pour les PromptTemplate (Prisma).
import { prisma } from "./prisma";
import { DEFAULT_PROMPT_CONTENU } from "./promptSelect";
import type { PromptTemplateDTO } from "./types";
import type { PromptTemplate } from "@prisma/client";

export function toPromptDTO(p: PromptTemplate): PromptTemplateDTO {
  return {
    id: p.id,
    nom: p.nom,
    marque: p.marque,
    categorie: p.categorie,
    contenu: p.contenu,
    estDefaut: p.estDefaut,
    prixReference: p.prixReference,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

/**
 * Garantit qu'au moins un prompt par défaut existe **pour cet utilisateur**,
 * pour que la génération fonctionne sans configuration. Idempotent : ne crée
 * rien s'il y en a déjà un.
 *
 * `estDefaut` est un singleton PAR COMPTE, pas global : sans le filtre userId,
 * le premier utilisateur à appeler cette fonction empêcherait tous les autres
 * d'avoir leur propre prompt par défaut.
 */
export async function ensureDefaultPrompt(userId: string): Promise<void> {
  const count = await prisma.promptTemplate.count({
    where: { userId, estDefaut: true },
  });
  if (count > 0) return;
  // Aucun défaut : on en crée un (ou on promeut un existant s'il y en a).
  const existing = await prisma.promptTemplate.findFirst({ where: { userId } });
  if (existing) {
    await prisma.promptTemplate.update({
      where: { id: existing.id },
      data: { estDefaut: true },
    });
    return;
  }
  await prisma.promptTemplate.create({
    data: {
      nom: "Prompt par défaut",
      marque: null,
      categorie: null,
      contenu: DEFAULT_PROMPT_CONTENU,
      estDefaut: true,
      userId,
    },
  });
}
