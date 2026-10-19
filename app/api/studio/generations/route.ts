import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized } from "@/lib/apiAuth";
import { deposerImage, lireImageEnBase64 } from "@/lib/studioBlob";
import { trouverModele } from "@/lib/studioCatalogue";
import { numeroSuivant, referencesPourAngle } from "@/lib/studioFiche";
import { cleDuCompte, genererImage } from "@/lib/studioGeneration";
import {
  executerGeneration,
  lireCorpsGeneration,
  type ContexteGeneration,
  type CorpsGeneration,
  type DepsGeneration,
} from "@/lib/studioLancement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Une génération dure de quelques secondes à plus d'une minute ; le client de
// génération s'arrête à 280 s, sous la limite des fonctions Vercel.
export const maxDuration = 300;

const enDataUrl = (img: { data: string; mimeType: string } | null) => (img ? `data:${img.mimeType};base64,${img.data}` : null);

/** Coloris, angle, vraies photos et essai parent, tous scopés par userId. null = pas à ce compte. */
async function chargerContexte(userId: string, c: CorpsGeneration): Promise<ContexteGeneration | null> {
  const [coloris, angle] = await Promise.all([
    prisma.studioColoris.findUnique({
      where: { userId_cle: { userId, cle: c.cle } },
      select: {
        id: true,
        details: true,
        references: { where: { userId }, select: { id: true, role: true, createdAt: true, urlImage: true } },
      },
    }),
    prisma.studioAngle.findFirst({ where: { id: c.angleId, userId }, select: { id: true, angle: true, roleReference: true } }),
  ]);
  if (!coloris || !angle) return null;

  let parent: ContexteGeneration["parent"] = null;
  if (c.essaiParentId) {
    // Le parent doit être un essai de CE coloris et de CET angle : corriger un
    // autre angle n'aurait aucun sens.
    const p = await prisma.studioEssai.findFirst({
      where: { id: c.essaiParentId, colorisId: coloris.id, angleId: angle.id, coloris: { userId } },
      select: { id: true, modele: true, urlImage: true },
    });
    if (!p) return null;
    parent = { id: p.id, modele: p.modele, image: p.urlImage ? enDataUrl(await lireImageEnBase64(p.urlImage, "generees", userId)) : null };
  }

  const choisies = referencesPourAngle(coloris.references, angle.roleReference);
  const lues = await Promise.all(choisies.map((r) => lireImageEnBase64(r.urlImage, "references", userId)));

  return {
    colorisId: coloris.id,
    angleId: angle.id,
    details: coloris.details,
    angleTexte: angle.angle,
    references: lues.map(enDataUrl).filter((u): u is string => u !== null),
    parent,
  };
}

function dependances(userId: string): DepsGeneration {
  return {
    chargerContexte,
    catalogue: (id) => trouverModele(id),
    cle: (uid) => cleDuCompte(uid),
    generer: (d, apiKey) => genererImage(d, apiKey),
    deposer: (uid, img) => deposerImage("generees", uid, img.octets, undefined, img.mime),

    async creerEssai(data) {
      // Deux générations du même modèle sur le même angle (double clic, deux
      // onglets) peuvent viser le même numéro : l'unique (coloris, angle,
      // modèle, numéro) en refuse une, on recalcule et on retente une fois.
      for (let tentative = 0; ; tentative++) {
        const existants = await prisma.studioEssai.findMany({
          where: { colorisId: data.colorisId, angleId: data.angleId, modele: data.modele, coloris: { userId } },
          select: { numero: true, modele: true },
        });
        try {
          return await prisma.studioEssai.create({
            data: { ...data, numero: numeroSuivant(existants, data.modele) },
            select: { id: true, numero: true },
          });
        } catch (e) {
          if (tentative === 0 && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
          throw e;
        }
      }
    },

    async rejeterParent(essaiId) {
      await prisma.studioEssai.updateMany({ where: { id: essaiId, coloris: { userId } }, data: { decision: "rejete" } });
    },

    async creerEchec(data) {
      await prisma.studioEchec.create({ data: { ...data, userId } });
    },
  };
}

/**
 * POST /api/studio/generations — UNE génération : un modèle d'un lancement.
 *
 * L'écran envoie une requête par modèle coché, en parallèle ; chacune porte la
 * liste complète (`modeles`), `lancementId` et `confirme`. Le devis est
 * recalculé ici sur toute la liste : au-delà de 0,10 $, ou avec un tarif
 * inconnu, sans `confirme: true` ⇒ 409 `confirmation_requise` avec le devis,
 * et rien n'est payé.
 *
 * Clé OpenRouter du compte uniquement (`missing_key` sinon). L'image va au Blob
 * sous `generees/<userId>/` et ne repart jamais dans la réponse : l'écran la lit
 * par `GET /api/studio/image?essai=`. La vérification IA est lancée par l'écran.
 */
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return unauthorized();

  const corps = lireCorpsGeneration(await req.json().catch(() => null));
  if ("erreur" in corps) return NextResponse.json({ error: corps.erreur, code: "corps_invalide" }, { status: 400 });

  try {
    const { status, body } = await executerGeneration(dependances(userId), userId, corps);
    return NextResponse.json(body, { status });
  } catch (e) {
    console.error("POST /api/studio/generations", e instanceof Error ? e.name + ": " + e.message : "erreur");
    return NextResponse.json({ error: "Génération impossible.", code: "provider" }, { status: 500 });
  }
}
