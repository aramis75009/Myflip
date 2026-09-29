// Garde d'authentification de GET /api/sacbase/stock.
//
// Même modèle que lib/hermesAuth.ts, mais SÉPARÉ : SacBase (tableau de bord
// des sacs Hipobuy, sur le VPS) n'a besoin que de LIRE, et son jeton ne doit
// ouvrir aucune des routes d'écriture de Hermes. Deux secrets, deux périmètres.
//
//   SACBASE_API_TOKEN  — secret partagé, comparé en temps constant.
//   SACBASE_USER_EMAIL — le compte MyFlip dont SacBase lit le stock.
//
// Le compte est une CONFIGURATION du déploiement, jamais un paramètre de la
// requête : sinon le jeton serait une clé passe-partout en lecture sur toute la
// base. Variables absentes = 503, jamais un accès libre.

import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

type EnvSacbase = { SACBASE_API_TOKEN?: string; SACBASE_USER_EMAIL?: string };

export type VerifJeton =
  | { ok: true; email: string }
  | { ok: false; status: 401 | 503; error: string };

const NON_CONFIGUREE = { ok: false, status: 503, error: "SacBase API non configurée" } as const;
const NON_AUTORISE = { ok: false, status: 401, error: "Non autorisé" } as const;

/**
 * Compare deux secrets sans fuite de timing. Le SHA-256 donne aux deux buffers
 * la même longueur : `timingSafeEqual` lève sur des tailles différentes, et
 * cette exception révélerait la longueur du secret attendu.
 */
function memeSecret(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Partie pure de la garde : configuration + jeton porteur. Même réponse pour
 * « absent » et « invalide » — distinguer les deux dirait à un attaquant que
 * son format d'en-tête est le bon.
 */
export function verifierJetonSacbase(env: EnvSacbase, authorization: string | null): VerifJeton {
  const attendu = env.SACBASE_API_TOKEN?.trim();
  const email = env.SACBASE_USER_EMAIL?.trim().toLowerCase();
  if (!attendu || !email) return NON_CONFIGUREE;

  const m = authorization ? /^Bearer\s+(.+)$/i.exec(authorization.trim()) : null;
  const fourni = m ? m[1].trim() : null;
  if (!fourni || !memeSecret(fourni, attendu)) return NON_AUTORISE;

  return { ok: true, email };
}

export type ResultatAuthSacbase =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

/**
 * À appeler en première ligne de la route : le `matcher` de middleware.ts
 * exclut `/api`, rien n'est protégé en amont.
 */
export async function authentifierSacbase(req: Request): Promise<ResultatAuthSacbase> {
  const { SACBASE_API_TOKEN, SACBASE_USER_EMAIL } = process.env;
  const v = verifierJetonSacbase({ SACBASE_API_TOKEN, SACBASE_USER_EMAIL }, req.headers.get("authorization"));
  if (!v.ok) return { ok: false, response: NextResponse.json({ error: v.error }, { status: v.status }) };

  const user = await prisma.user.findUnique({ where: { email: v.email }, select: { id: true } });
  if (!user)
    return { ok: false, response: NextResponse.json({ error: NON_CONFIGUREE.error }, { status: 503 }) };

  return { ok: true, userId: user.id };
}
