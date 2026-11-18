import "server-only";

import { choisirIA, genererAnnonce } from "@/lib/fournisseurIA";
import { prisma } from "@/lib/prisma";
import { resoudreReglages } from "@/lib/settings";
import type { DepsReformulation } from "@/lib/studioReformulation";

/**
 * Les dépendances réelles de `reformulerVersion` : Prisma scopé par `userId`
 * (en LECTURE seule) et l'IA du compte.
 *
 * ⚠️ C'est le SEUL fichier du Studio qui parle à `lib/fournisseurIA` : la
 * reformulation est du texte, rédigé par le même sélecteur d'IA que l'annonce
 * (`choisirIA("annonce", …)` : fournisseur, modèle et clé du compte). La
 * génération d'images et l'avis IA du Studio ont été supprimés le 17/11/2026
 * (`lib/studioReformulation.test.ts` garde qu'aucun autre fichier du Studio n'y parle).
 *
 * Aucun réglage ni fournisseur de plus : ce qui est choisi dans « Mon compte »
 * pour les annonces sert ici. Aucune photo : `genererAnnonce` reçoit une liste
 * d'images vide, la reformulation ne part que du texte.
 */
export function depsReformulation(userId: string): DepsReformulation {
  return {
    lireVersion: (id) =>
      // `numero >= 2` : la Version 1 n'est jamais en base, et aucune ligne ne s'y trompe.
      prisma.studioVersion.findFirst({ where: { id, userId, numero: { gte: 2 } }, select: { numero: true, titre: true, motsCles: true } }),

    demanderIA: async (prompt) => {
      const reglages = await resoudreReglages(userId);
      const choix = choisirIA("annonce", reglages);
      try {
        return await genererAnnonce(choix, prompt, []);
      } catch (err) {
        // Les messages des clients sont déjà sans secret ; le modèle aide à diagnostiquer.
        console.error(`[studio reformuler] ${choix.fournisseur}/${choix.modele} :`, err instanceof Error ? err.message : "erreur");
        throw err;
      }
    },
  };
}
