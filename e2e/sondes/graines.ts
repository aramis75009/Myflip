/**
 * Données propres aux sondes de bugs, dans un compte à part (« sonde »).
 *
 * Pourquoi un compte à part : les sondes veulent des configurations précises
 * (15 photos et 9 angles, 30 articles « À comptabiliser », un essai sans avis IA…)
 * qu'il serait faux d'imposer aux comptes `demo` et `neuf`, dont les captures de
 * la suite décrivent l'état du seed. Rien de ce fichier ne touche ces deux
 * comptes. Les ids sont préfixés « e2e-sonde- » ; les SKU « SND » et « TST1 ».
 *
 * Semé UNE fois par lancement, à la demande, par `assurerSessionSonde`
 * (e2e/sondes/session.ts), sous un verrou : deux workers ne sèment jamais en
 * même temps. Même garde que le seed : refuse toute base non locale.
 *
 * Contenu du compte :
 *  - 9 prompts d'angle actifs (X12 : le tableau défile dès 8 angles) ;
 *  - coloris `probe-noir` : 15 photos sur la planche, 2 essais à juger AVEC
 *    avis IA (photos 1 et 2, 1er angle), 1 essai rejeté à image conservée (photo 1,
 *    2e angle), 1 essai validé (photo 15) ;
 *  - coloris `probe-14` : 14 photos, donc 1 prise libre (X10) ;
 *  - coloris `probe-sansverif` : 1 photo, 1 essai à juger SANS avis IA (X0) ;
 *  - coloris `5039-white-volt` (celui du faux SacBase) : 15 photos, aucun essai, pour
 *    le sélecteur de modèles et les favoris (S6, S8), qui exigent un sac cible ;
 *  - 30 articles « À comptabiliser » (SND1 à SND30) et 1 article TST1 « En stock ».
 */
import bcrypt from "bcryptjs";
import { Prisma, PrismaClient } from "@prisma/client";

import { nomPrise, promptVariante } from "@/lib/studioCases";
import { MODELE_MANUEL } from "@/lib/studioFiche";

import { MOT_DE_PASSE_E2E } from "../compte-test";
import { DATABASE_URL_E2E, estUrlLocale } from "../outils/environnement";

export const COMPTE_SONDE = {
  id: "e2esonde0000000000000001",
  email: "e2e-sonde@myflip.test",
  prenom: "Sonde",
  plan: "solo",
} as const;

export const CLES_SONDE = {
  /** 15 photos, essais à juger, rejet, validé. */
  noir: "probe-noir",
  /** 14 photos : 1 prise libre. */
  quatorze: "probe-14",
  /** 1 photo, 1 essai à juger sans avis IA. */
  sansVerif: "probe-sansverif",
  /**
   * Coloris du faux SacBase (e2e/seed/sacbase-coloris.json : sacs SDN5 et SDN6 « En stock ») : il porte donc des
   * « sacs sans annonce » et le bouton « Générer » du Studio s'active. 15 photos, aucun essai : 15 cases libres.
   */
  catalogue: "5039-white-volt",
} as const;

export const NB_ANGLES_SONDE = 9;
export const ID_ESSAI_REJETE = "e2e-sonde-essai-rej";

const PREFIXE = "e2e-sonde-";
const HOTE_BLOB = "e2e.private.blob.vercel-storage.com";

const hex8 = (n: number) => n.toString(16).padStart(8, "0");
/** Empreinte de 64 caractères hexadécimaux, stable, distincte par (portée, n). */
const empreinte = (portee: number, n: number) => (hex8(portee) + hex8(n)).repeat(4);
/** UUID stable tiré d'un entier. */
const uuid = (n: number) => `${hex8(n)}-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

const VERIF_SONDE: Prisma.InputJsonObject = {
  details: [{ detail: "Logo principal", statut: "fidele", note: "Conforme à la référence." }],
  angleRespecte: true,
  scoreGlobal: 90,
  verdict: "ok",
};

function verifierBaseLocale(): void {
  if (process.env.NODE_ENV === "production") throw new Error("Graines de sonde refusées : NODE_ENV vaut production.");
  if (!estUrlLocale(DATABASE_URL_E2E)) throw new Error("Graines de sonde refusées : la base e2e n'est pas locale.");
}

type ParamsColoris = {
  cle: string;
  portee: number;
  photos: number;
  maintenant: number;
};

async function creerColorisAvecPhotos(prisma: Prisma.TransactionClient, userId: string, p: ParamsColoris) {
  const colorisId = `${PREFIXE}coloris-${p.cle}`;
  await prisma.studioColoris.create({
    data: { id: colorisId, userId, cle: p.cle, modele: "Sonde", coloris: "Noir", details: "Logo principal", createdAt: new Date(p.maintenant - 86_400_000) },
  });
  const referenceIds: string[] = [];
  const lignes: Prisma.StudioReferenceCreateManyInput[] = [];
  for (let n = 1; n <= p.photos; n++) {
    const id = `${PREFIXE}ref-${p.cle}-${String(n).padStart(2, "0")}`;
    referenceIds.push(id);
    lignes.push({
      id,
      userId,
      colorisId,
      origine: "studio",
      role: n === 1 ? "face" : "detail",
      urlImage: `https://${HOTE_BLOB}/references/${userId}/${empreinte(p.portee, n)}.jpg`,
      ordre: n,
      prise: nomPrise(n, "V1"),
      createdAt: new Date(p.maintenant - 86_400_000 + n * 1000),
    });
  }
  await prisma.studioReference.createMany({ data: lignes });
  return { colorisId, referenceIds };
}

type ParamsEssai = {
  id: string;
  colorisId: string;
  angleId: string;
  angleNo: number;
  referenceId: string;
  numero: number;
  decision: "valide" | "rejete" | null;
  verif: boolean;
  compteur: number;
  maintenant: number;
};

function essai(p: ParamsEssai): Prisma.StudioEssaiCreateManyInput {
  return {
    id: p.id,
    colorisId: p.colorisId,
    angleId: p.angleId,
    numero: p.numero,
    source: "manuel",
    modele: MODELE_MANUEL,
    promptUtilise: promptVariante("", `Angle: test view number ${p.angleNo}.`),
    urlImage: `https://${HOTE_BLOB}/generees/${COMPTE_SONDE.id}/${uuid(p.compteur + 1000)}.png`,
    verifIA: p.verif ? VERIF_SONDE : Prisma.DbNull,
    decision: p.decision,
    referenceId: p.referenceId,
    createdAt: new Date(p.maintenant - 3_600_000 + p.compteur * 1000),
  };
}

/** Sème le compte « sonde » et ses données. Idempotent : sans effet si le compte existe déjà. */
export async function semerCompteSonde(maintenant: Date = new Date()): Promise<{ deja: boolean }> {
  verifierBaseLocale();
  // Prisma lit DATABASE_URL pour son propre contrôle : la poser à la base locale avant tout.
  process.env.DATABASE_URL = DATABASE_URL_E2E;
  const prisma = new PrismaClient({ datasourceUrl: DATABASE_URL_E2E });
  try {
    if (await prisma.user.findUnique({ where: { id: COMPTE_SONDE.id }, select: { id: true } })) return { deja: true };

    const hash = await bcrypt.hash(MOT_DE_PASSE_E2E, 10);
    const t0 = maintenant.getTime();
    const userId = COMPTE_SONDE.id;
    // Tout ou rien : un échec en cours de route ne laisse pas un compte à moitié semé.
    await prisma.$transaction(
      async (tx) => {
        await tx.user.create({
          data: { id: userId, email: COMPTE_SONDE.email, password: hash, prenom: COMPTE_SONDE.prenom, plan: COMPTE_SONDE.plan, createdAt: new Date(t0 - 30 * 86_400_000) },
        });

        // ── Prompts d'angle (communs à tout le compte) ─────────────────────────
        const angleIds: string[] = [];
        for (let i = 1; i <= NB_ANGLES_SONDE; i++) {
          const id = `${PREFIXE}angle-${i}`;
          angleIds.push(id);
          await tx.studioAngle.create({
            data: { id, userId, nom: `Angle ${i}`, angle: `Angle: test view number ${i}.`, ordre: i, createdAt: new Date(t0 - 86_400_000 + i) },
          });
        }

        // ── probe-noir : 15 photos, 2 à juger, 1 rejeté, 1 validé ──────────────
        const noir = await creerColorisAvecPhotos(tx, userId, { cle: CLES_SONDE.noir, portee: 1, photos: 15, maintenant: t0 });
        const essaisNoir: Prisma.StudioEssaiCreateManyInput[] = [
          essai({ id: `${PREFIXE}essai-1`, colorisId: noir.colorisId, angleId: angleIds[0], angleNo: 1, referenceId: noir.referenceIds[0], numero: 1, decision: null, verif: true, compteur: 1, maintenant: t0 }),
          essai({ id: `${PREFIXE}essai-2`, colorisId: noir.colorisId, angleId: angleIds[0], angleNo: 1, referenceId: noir.referenceIds[1], numero: 2, decision: null, verif: true, compteur: 2, maintenant: t0 }),
          essai({ id: ID_ESSAI_REJETE, colorisId: noir.colorisId, angleId: angleIds[1], angleNo: 2, referenceId: noir.referenceIds[0], numero: 1, decision: "rejete", verif: true, compteur: 3, maintenant: t0 }),
          essai({ id: `${PREFIXE}essai-valide`, colorisId: noir.colorisId, angleId: angleIds[0], angleNo: 1, referenceId: noir.referenceIds[14], numero: 3, decision: "valide", verif: true, compteur: 4, maintenant: t0 }),
        ];
        await tx.studioEssai.createMany({ data: essaisNoir });

        // ── probe-14 : 14 photos, une prise libre ──────────────────────────────
        await creerColorisAvecPhotos(tx, userId, { cle: CLES_SONDE.quatorze, portee: 2, photos: 14, maintenant: t0 });

        // ── probe-sansverif : un essai à juger SANS avis IA ────────────────────
        const sv = await creerColorisAvecPhotos(tx, userId, { cle: CLES_SONDE.sansVerif, portee: 3, photos: 1, maintenant: t0 });
        await tx.studioEssai.createMany({
          data: [essai({ id: `${PREFIXE}essai-sv-1`, colorisId: sv.colorisId, angleId: angleIds[0], angleNo: 1, referenceId: sv.referenceIds[0], numero: 1, decision: null, verif: false, compteur: 10, maintenant: t0 })],
        });

        // ── 5039-white-volt : coloris du catalogue SacBase, 15 photos, 15 cases libres ──
        await creerColorisAvecPhotos(tx, userId, { cle: CLES_SONDE.catalogue, portee: 4, photos: 15, maintenant: t0 });

        // ── Articles : 30 « À comptabiliser » et TST1 ──────────────────────────
        const transporteurs = ["Mondial Relay", "Colissimo", "Vinted Go"];
        const articles: Prisma.ArticleCreateManyInput[] = [];
        for (let i = 1; i <= 30; i++) {
          articles.push({
            id: `${PREFIXE}art-${i}`,
            sku: `SND${i}`,
            marque: "Sonde",
            categorie: "Polo",
            lot: "Sonde",
            statut: "À comptabiliser",
            prixAchat: 10,
            transporteur: transporteurs[i % transporteurs.length],
            compteVente: i % 2 === 0 ? "VINTED_PRO" : "VINTED_SECOND",
            dateMiseEnVente: new Date(t0 - (i + 5) * 86_400_000),
            createdAt: new Date(t0 - 40 * 86_400_000),
            userId,
          });
        }
        articles.push({
          id: `${PREFIXE}art-tst1`,
          sku: "TST1",
          marque: "Sonde",
          categorie: "Polo",
          lot: "Sonde",
          statut: "En stock",
          prixAchat: 10,
          createdAt: new Date(t0 - 40 * 86_400_000),
          userId,
        });
        await tx.article.createMany({ data: articles });
      },
      { timeout: 120_000, maxWait: 30_000 },
    );
    return { deja: false };
  } finally {
    await prisma.$disconnect();
  }
}
