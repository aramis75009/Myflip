import { NextRequest, NextResponse } from "next/server";
import { getUserId, unauthorized } from "@/lib/apiAuth";
import { resoudreReglages } from "@/lib/settings";
import { testerCle, type Fournisseur } from "@/lib/aiTest";

export const dynamic = "force-dynamic";

const FOURNISSEURS: Fournisseur[] = ["ollama", "openrouter"];

// POST /api/user/settings/test?fournisseur=ollama|openrouter
//
// Teste la clé RÉELLEMENT utilisée pour ce compte — celle de l'utilisateur si
// elle existe, sinon celle de l'application. C'est la question qui intéresse
// l'utilisateur : « est-ce que ça va marcher pour moi ? »
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return unauthorized();

  const param = req.nextUrl.searchParams.get("fournisseur");
  const fournisseur = FOURNISSEURS.find((f) => f === param);
  if (!fournisseur) {
    return NextResponse.json({ error: "Fournisseur inconnu." }, { status: 400 });
  }

  try {
    const reglages = await resoudreReglages(userId);
    const cle = { ollama: reglages.ollamaKey, openrouter: reglages.openrouterKey }[fournisseur];

    if (!cle) {
      return NextResponse.json({
        ok: false,
        message: "Aucune clé : ni sur ton compte, ni sur l'application.",
        source: reglages.source[fournisseur],
      });
    }

    const resultat = await testerCle(fournisseur, cle);
    return NextResponse.json({ ...resultat, source: reglages.source[fournisseur] });
  } catch (err) {
    console.error("POST /api/user/settings/test", err);
    return NextResponse.json({ error: "Erreur lors du test." }, { status: 500 });
  }
}
