// GET /api/sacbase/stock — lecture seule, pour SacBase (tableau de bord des
// sacs Hipobuy). Hors session : jeton porteur SACBASE_API_TOKEN, compte fixé
// par SACBASE_USER_EMAIL (cf. lib/sacbaseAuth.ts). Aucune méthode d'écriture.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authentifierSacbase } from "@/lib/sacbaseAuth";
import { articleSacbaseSelect, reponseSacbase, whereSacbase } from "@/lib/sacbaseStock";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await authentifierSacbase(req);
  if (!auth.ok) return auth.response;

  try {
    const rows = await prisma.article.findMany({
      where: whereSacbase(auth.userId),
      select: articleSacbaseSelect,
    });
    const { ecartes, ...corps } = reponseSacbase(rows);
    if (ecartes.length)
      console.warn(`[sacbase] ${ecartes.length} article(s) hors contrat écarté(s) :`, ecartes.join(", "));
    return NextResponse.json(corps, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("GET /api/sacbase/stock", err);
    return NextResponse.json({ error: "Erreur lors de la lecture du stock." }, { status: 500 });
  }
}
