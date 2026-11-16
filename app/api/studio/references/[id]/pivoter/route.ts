import { NextRequest, NextResponse } from "next/server";

import { getUserId, unauthorized } from "@/lib/apiAuth";
import { creerCopiePivotee, type CodeRefus } from "@/lib/studioCopie";
import { depsCopie } from "@/lib/studioCopieServeur";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Lecture du fichier, rotation et JPEG d'une image de 1600 px : une seconde ou deux. Large marge pour un stockage lent.
export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };

const STATUT: Record<CodeRefus, number> = {
  angle_invalide: 400,
  retouche_invalide: 400,
  retouche_vide: 400,
  est_une_copie: 400,
  introuvable: 404,
  image_introuvable: 404,
  deja_la: 409,
  rendu_impossible: 422,
};

/**
 * POST /api/studio/references/[id]/pivoter — enregistre une COPIE pivotée d'une
 * vraie photo. Corps JSON : `{ angle }`, un entier de −45 à +45 (pas 0).
 *
 * L'original reste intact (aucune écriture sur sa ligne ni sur son fichier).
 * La copie est une nouvelle ligne `StudioReference` du même coloris, liée à
 * l'original (`copieDeId`), hors tableau (`ordre` null), dont le fichier est
 * rendu côté serveur par sharp aux dimensions exactes de l'original, sans coin
 * vide (cf. `lib/studioPivot.ts`). Toute la logique est dans
 * `lib/studioCopie.ts` ; cette route ne fait que l'authentification et les codes.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;

  const corps = (await req.json().catch(() => null)) as { angle?: unknown } | null;
  if (!corps || typeof corps !== "object") return NextResponse.json({ error: "Corps illisible." }, { status: 400 });

  try {
    const res = await creerCopiePivotee(depsCopie(userId), { referenceId: id, angle: corps.angle });
    if (!res.ok) {
      return NextResponse.json({ error: res.message, code: res.code, ...(res.existante ? { id: res.existante } : {}) }, { status: STATUT[res.code] });
    }
    return NextResponse.json({ id: res.id, angle: res.angle, largeur: res.largeur, hauteur: res.hauteur }, { status: 201 });
  } catch (err) {
    // Jamais le message : il peut citer un chemin de stockage ou une clé.
    console.error("POST /api/studio/references/[id]/pivoter", err instanceof Error ? err.name : "erreur");
    return NextResponse.json({ error: "Copie impossible." }, { status: 500 });
  }
}
