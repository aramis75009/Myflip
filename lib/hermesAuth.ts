// Garde d'authentification de l'API Hermes (/api/hermes/*).
//
// Pourquoi une garde à part de `lib/apiAuth.ts` : Hermes n'est pas un
// navigateur. Il n'a pas de cookie de session, pas de CSRF, pas de compte à
// lui — c'est un agent qui agit POUR un compte, depuis un serveur tiers.
// L'authentification se fait donc par jeton porteur, et l'identité du compte
// est une CONFIGURATION du déploiement, pas quelque chose que l'appelant
// choisit : si Hermes pouvait désigner le compte sur lequel écrire, le jeton
// deviendrait une clé passe-partout sur toute la base.
//
// Deux variables d'environnement, aucune valeur en dur :
//   HERMES_API_TOKEN  — le secret partagé, comparé en temps constant.
//   HERMES_USER_EMAIL — le compte MyFlip sur lequel Hermes agit.
//
// Sans elles, l'API n'est pas « ouverte par défaut » : elle répond 503. Une
// variable oubliée sur Vercel doit se voir comme une panne de configuration,
// jamais se dégrader en accès libre.

import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

export type ResultatAuth =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

const refus = (error: string, status: number): ResultatAuth => ({
  ok: false,
  response: NextResponse.json({ error }, { status }),
});

/**
 * Compare deux secrets sans fuite de timing.
 *
 * Le passage par un SHA-256 n'est pas là pour protéger le jeton mais pour
 * donner aux deux buffers la même longueur : `timingSafeEqual` lève sur des
 * tailles différentes, et cette exception révélerait à elle seule la longueur
 * du secret attendu.
 */
function memeSecret(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Jeton porté par l'en-tête `Authorization: Bearer …`, ou null. */
function jetonPorteur(req: Request): string | null {
  const brut = req.headers.get("authorization");
  if (!brut) return null;
  const m = /^Bearer\s+(.+)$/i.exec(brut.trim());
  return m ? m[1].trim() : null;
}

/**
 * Authentifie une requête Hermes et rend l'`userId` du compte visé.
 *
 * À appeler en première ligne de CHAQUE route sous /api/hermes : le `matcher`
 * de middleware.ts exclut `api`, donc rien n'est protégé en amont.
 *
 *   const auth = await authentifierHermes(req);
 *   if (!auth.ok) return auth.response;
 */
export async function authentifierHermes(req: Request): Promise<ResultatAuth> {
  const attendu = process.env.HERMES_API_TOKEN?.trim();
  const email = process.env.HERMES_USER_EMAIL?.trim().toLowerCase();

  if (!attendu)
    return refus("API Hermes non configurée (HERMES_API_TOKEN absent).", 503);
  if (!email)
    return refus("API Hermes non configurée (HERMES_USER_EMAIL absent).", 503);

  const fourni = jetonPorteur(req);
  // Même message et même code pour « absent » et « invalide » : distinguer les
  // deux dirait à un attaquant que son format d'en-tête est le bon.
  if (!fourni || !memeSecret(fourni, attendu))
    return refus("Jeton Hermes absent ou invalide.", 401);

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!user)
    return refus(
      `API Hermes non configurée (aucun compte pour HERMES_USER_EMAIL).`,
      503,
    );

  return { ok: true, userId: user.id };
}
