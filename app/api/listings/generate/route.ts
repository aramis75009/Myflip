import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized } from "@/lib/apiAuth";
import { ensureDefaultPrompt, toPromptDTO } from "@/lib/promptsServer";
import { compilePrompt, pickPrompt } from "@/lib/promptSelect";
import type { ImageAnnonce } from "@/lib/openrouter";
import { choisirIA, genererAnnonce } from "@/lib/fournisseurIA";
import { resoudreReglages } from "@/lib/settings";

export const dynamic = "force-dynamic";
// La génération peut être longue, et Ollama Cloud en refait UNE si la première
// réponse est inutilisable (cf. lib/ollama.ts) : de 60 s à 120 s pour que la
// relance ne soit pas coupée en vol.
export const maxDuration = 120;

type Body = {
  sku?: string;
  marque?: string | null;
  categorie?: string | null;
  taille?: string | null;
  etat?: string | null;
  matiere?: string | null;
  details?: string | null; // infos libres saisies par l'utilisateur
  images?: string[]; // dataURL ("data:image/jpeg;base64,…") ou base64 brut
  promptId?: string; // prompt choisi manuellement côté client
};

// Parse une image client (dataURL ou base64 brut) → { mimeType, data }.
function parseImage(raw: string): ImageAnnonce {
  const m = raw.match(/^data:([^;]+);base64,([\s\S]*)$/);
  if (m) return { mimeType: m[1], data: m[2] };
  return { mimeType: "image/jpeg", data: raw };
}

// POST /api/listings/generate
export async function POST(req: NextRequest) {
  // Cette route consomme la clé IA du serveur (repli de l'application) : sans
  // garde, n'importe qui pouvait générer des annonces aux frais du déploiement.
  const userId = await getUserId();
  if (!userId) return unauthorized();

  // Hors du try : le bloc catch en a besoin pour identifier l'article fautif.
  let sku: string | undefined;
  let promptNom: string | undefined;
  let nbImages = 0;
  let fournisseurLog: string | undefined;

  try {
    const body = (await req.json()) as Body;
    sku = body.sku;
    const images = (body.images ?? []).filter(Boolean);
    nbImages = images.length;
    if (images.length === 0) {
      return NextResponse.json(
        { error: "Au moins une photo est requise." },
        { status: 400 },
      );
    }

    // Sélection du prompt : manuel (promptId fourni) ou automatique.
    await ensureDefaultPrompt(userId);
    let tmpl = null;
    if (body.promptId) {
      // findFirst avec userId : un promptId d'un autre compte est traité comme
      // inexistant et retombe sur la sélection automatique.
      const found = await prisma.promptTemplate.findFirst({
        where: { id: body.promptId, userId },
      });
      if (found) tmpl = toPromptDTO(found);
    }
    if (!tmpl) {
      const prompts = await prisma.promptTemplate.findMany({
        where: { userId },
      });
      tmpl = pickPrompt(
        prompts.map(toPromptDTO),
        body.marque ?? null,
        body.categorie ?? null,
      );
    }
    if (!tmpl) {
      return NextResponse.json(
        { error: "Aucun prompt disponible." },
        { status: 500 },
      );
    }
    promptNom = tmpl.nom;

    const compiled = compilePrompt(tmpl.contenu, {
      marque: body.marque,
      categorie: body.categorie,
      taille: body.taille,
      etat: body.etat,
      matiere: body.matiere,
      sku: body.sku,
      details: body.details,
    });

    // Fournisseur du compte (Ollama Cloud par défaut, OpenRouter en secours),
    // avec SA clé : celle de l'utilisateur si elle existe, sinon celle de
    // l'application. Le modèle n'a pas de repli d'environnement : `choisirIA`
    // applique le défaut du fournisseur quand le compte n'a rien choisi.
    const reglages = await resoudreReglages(userId);
    const choix = choisirIA("annonce", reglages);
    fournisseurLog = `${choix.fournisseur}/${choix.modele}`;
    const result = await genererAnnonce(choix, compiled, images.map(parseImage));

    return NextResponse.json({ ...result, promptNom: tmpl.nom });
  } catch (err) {
    // Le SKU et le prompt dans le log : sans eux, une génération ratée parmi
    // plusieurs ne se rattache à aucun article, et le log ne sert à rien.
    console.error(
      `POST /api/listings/generate sku=${sku ?? "?"} prompt=${promptNom ?? "?"} images=${nbImages} modele=${fournisseurLog ?? "?"}`,
      err,
    );
    const message =
      err instanceof Error ? err.message : "Erreur lors de la génération.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
