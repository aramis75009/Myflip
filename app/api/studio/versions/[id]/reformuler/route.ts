import { NextRequest, NextResponse } from "next/server";

import { getUserId, unauthorized } from "@/lib/apiAuth";
import { reformulerVersion, type CodeRefusReformulation } from "@/lib/studioReformulation";
import { depsReformulation } from "@/lib/studioReformulationServeur";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Comme /api/listings/generate : Ollama Cloud et Anthropic refont UN appel si la première réponse est inutilisable.
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

const STATUT: Record<CodeRefusReformulation, number> = {
  version_une: 400,
  rien_a_reformuler: 400,
  introuvable: 404,
  proposition_inutilisable: 502,
  ia_indisponible: 502,
};

/**
 * POST /api/studio/versions/[id]/reformuler — propose un nouveau titre et des
 * mots-clés légèrement changés pour une version (la 2 et les suivantes).
 * Aucun corps : le serveur part du titre et des mots-clés ENREGISTRÉS de la
 * version (ce qu'Aramis a corrigé à la main compris), jamais d'un texte envoyé
 * par le navigateur.
 *
 * Ne part que sur le clic « Reformuler » / « Proposer autre chose » : aucun
 * autre chemin du code n'appelle cette route ni `reformulerVersion`. N'ÉCRIT
 * RIEN : la réponse `{ proposition: { titre, motsCles } }` ne devient une
 * donnée que par « Garder » (`PATCH /api/studio/versions/[id]`). Les tirets
 * (`description`) et le SKU ne sont jamais envoyés à l'IA ni renvoyés.
 */
export async function POST(_req: NextRequest, { params }: Ctx) {
  // Cette route consomme la clé IA du compte (ou celle de l'application) : sans garde, aux frais d'autrui.
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;

  try {
    const res = await reformulerVersion(depsReformulation(userId), { versionId: id });
    if (!res.ok) {
      if (res.raison) console.error(`POST /api/studio/versions/[id]/reformuler ${res.code} : ${res.raison}`);
      return NextResponse.json({ error: res.message, code: res.code }, { status: STATUT[res.code] });
    }
    return NextResponse.json({ proposition: res.proposition });
  } catch (err) {
    // Jamais le message : il peut citer un chemin ou une clé.
    console.error("POST /api/studio/versions/[id]/reformuler", err instanceof Error ? err.name : "erreur");
    return NextResponse.json({ error: "Reformulation impossible : réessaie.", code: "ia_indisponible" }, { status: 502 });
  }
}
