import { NextRequest, NextResponse } from "next/server";

import { getUserId, unauthorized } from "@/lib/apiAuth";
import { assemblerZip, fluxZip, lireEntreeZip, type CodeRefusZip } from "@/lib/studioZip";
import { depsZip } from "@/lib/studioZipServeur";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Jusqu'à 15 photos lues dans le stockage, en parallèle.
export const maxDuration = 60;

const STATUT: Record<CodeRefusZip, number> = {
  requete_invalide: 400,
  introuvable: 404,
  sans_photo: 404,
  photo_introuvable: 404,
};

/**
 * GET /api/studio/versions/zip?cle=<coloris>&numero=<n>[&sku=<sac>] —
 * « Télécharger les N photos » d'une version : UN zip des photos dans l'ordre
 * de la version, `01.jpg`, `02.jpg`…, octets identiques à ceux du stockage.
 *
 * `numero` ≥ 2 : une version enregistrée du coloris. `numero` = 1 : la Version 1
 * (l'annonce actuelle) du sac `sku`, c'est-à-dire ses images validées.
 * Authentifiée ; aucun identifiant de photo ne vient du navigateur : tout est
 * relu pour le compte (`lib/studioZipServeur.ts`), un coloris ou une photo d'un
 * autre compte est introuvable (404). Nom : `<SKU>-version-<n>.zip`.
 */
export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return unauthorized();

  const p = req.nextUrl.searchParams;
  const lu = lireEntreeZip({ cle: p.get("cle"), numero: p.get("numero"), sku: p.get("sku") });
  if (!lu.ok) return NextResponse.json({ error: lu.message, code: "requete_invalide" }, { status: STATUT.requete_invalide });

  try {
    const res = await assemblerZip(depsZip(userId), lu.entree);
    if (!res.ok) return NextResponse.json({ error: res.message, code: res.code }, { status: STATUT[res.code] });
    return new Response(fluxZip(res.zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${res.nom}"`,
        "Content-Length": String(res.zip.byteLength),
        // Privé et jamais gardé : les photos d'une version changent.
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    // Jamais le message : il peut citer un chemin de stockage ou une clé.
    console.error("GET /api/studio/versions/zip", err instanceof Error ? err.name : "erreur");
    return NextResponse.json({ error: "Téléchargement impossible : réessaie." }, { status: 500 });
  }
}
