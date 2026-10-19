import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized } from "@/lib/apiAuth";
import { whereSacbase } from "@/lib/sacbaseStock";
import { EMPREINTE_RE, deposerImage, erreurFichier } from "@/lib/studioBlob";
import { buildSkuIndex, getColoris } from "@/lib/studioColoris";
import { estOrigine, estRole, roleSuggere } from "@/lib/studioFiche";
import { assurerColoris } from "@/lib/studioServeur";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Au plus autant de photos par appel : le corps reste sous les 4,5 Mo de Vercel. */
const MAX_FICHIERS = 12;

/**
 * POST /api/studio/references — conserve de VRAIES photos comme références.
 *
 * Corps multipart :
 *   origine     "mise_en_vente" | "studio"
 *   sku         obligatoire pour mise_en_vente, facultatif sinon
 *   cle         coloris visé (import manuel depuis la fiche, origine "studio")
 *   position    rang de la 1re photo dans sa série (suggère le rôle), défaut 0
 *   photo       un ou plusieurs JPEG (compressés côté client, ~1600 px)
 *   empreinte   une par photo, SHA-256 du fichier d'origine (dédoublonnage)
 *   role        facultatif, un par photo ; sinon suggéré par l'ordre
 *
 * Sens unique (spec §7) : une photo ENTRE dans le Studio, rien n'en sort. Pour
 * la mise en vente, l'appel est best-effort côté client : une erreur ici ne
 * bloque jamais une annonce.
 *
 * Périmètre Hipobuy (spec §12) : un SKU qui n'est pas un sac Hipobuy de ce
 * compte est ignoré AVANT tout envoi au Blob (réponse 200, `ignore: true`).
 */
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return unauthorized();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Corps illisible." }, { status: 400 });
  }

  const origine = form.get("origine");
  if (!estOrigine(origine)) return NextResponse.json({ error: "Origine inconnue." }, { status: 400 });
  const sku = (typeof form.get("sku") === "string" ? (form.get("sku") as string) : "").trim().toUpperCase() || null;
  const cle = (typeof form.get("cle") === "string" ? (form.get("cle") as string) : "").trim() || null;
  const position = Math.max(0, Number.parseInt(String(form.get("position") ?? "0"), 10) || 0);

  const fichiers = form.getAll("photo").filter((f): f is File => typeof f !== "string");
  const empreintes = form.getAll("empreinte").map(String);
  const roles = form.getAll("role").map(String);
  if (fichiers.length === 0) return NextResponse.json({ error: "Aucune photo." }, { status: 400 });
  if (fichiers.length > MAX_FICHIERS) {
    return NextResponse.json({ error: `${MAX_FICHIERS} photos au plus par envoi.` }, { status: 400 });
  }
  if (empreintes.length !== fichiers.length || !empreintes.every((e) => EMPREINTE_RE.test(e))) {
    return NextResponse.json({ error: "Empreintes manquantes ou invalides." }, { status: 400 });
  }
  for (const f of fichiers) {
    const err = erreurFichier(f);
    if (err) return NextResponse.json({ error: `${f.name || "photo"} : ${err}` }, { status: 400 });
  }

  try {
    // ── À quel coloris rattacher ? ─────────────────────────────────────────
    let colorisId: string | null = null;
    if (origine === "mise_en_vente") {
      if (!sku) return NextResponse.json({ error: "SKU requis." }, { status: 400 });
      // Lecture seule du stock : seul un sac Hipobuy de CE compte entre au Studio.
      const sac = await prisma.article.findFirst({ where: { ...whereSacbase(userId), sku }, select: { id: true } });
      if (!sac) return NextResponse.json({ ignore: true, conservees: 0 });
      // Un seul appel au catalogue pour toute la série (cache 60 s, jamais de levée).
      const source = await getColoris();
      if (source.kind !== "off") {
        const cleSac = buildSkuIndex(source.data).get(sku);
        const c = cleSac ? source.data.coloris.find((x) => x.cle === cleSac) : undefined;
        if (c) colorisId = (await assurerColoris(userId, c)).id;
      }
      // SacBase injoignable ou SKU inconnu : photo gardée non rattachée (spec §4).
    } else {
      if (!cle) return NextResponse.json({ error: "Coloris requis." }, { status: 400 });
      const c = await prisma.studioColoris.findUnique({ where: { userId_cle: { userId, cle } }, select: { id: true } });
      if (!c) return NextResponse.json({ error: "Coloris introuvable." }, { status: 404 });
      colorisId = c.id;
    }

    // ── Envoi, en sautant les photos déjà conservées ───────────────────────
    const deja = await prisma.studioReference.findMany({
      where: { userId, OR: empreintes.map((e) => ({ urlImage: { endsWith: `/${e}.jpg` } })) },
      select: { urlImage: true },
    });
    const connues = new Set(deja.map((d) => d.urlImage.slice(d.urlImage.lastIndexOf("/") + 1, -".jpg".length)));

    let conservees = 0;
    let doublons = 0;
    for (let i = 0; i < fichiers.length; i++) {
      if (connues.has(empreintes[i])) {
        doublons++;
        continue;
      }
      connues.add(empreintes[i]);
      const url = await deposerImage("references", userId, fichiers[i], empreintes[i]);
      await prisma.studioReference.create({
        data: {
          userId,
          colorisId,
          sku,
          origine,
          role: estRole(roles[i]) ? roles[i] : roleSuggere(position + i),
          urlImage: url,
        },
      });
      conservees++;
    }
    return NextResponse.json({ conservees, doublons, rattachee: colorisId !== null });
  } catch (err) {
    // Jamais le contenu du formulaire dans le log : ni image ni jeton.
    console.error("POST /api/studio/references", err instanceof Error ? err.name + ": " + err.message : "erreur");
    return NextResponse.json({ error: "Conservation impossible." }, { status: 500 });
  }
}
