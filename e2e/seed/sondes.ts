/**
 * Graines ADDITIVES pour les sondes de bugs (docs/refonte/etude-2026-10-20/bugs-sondes.json).
 *
 * Le seed principal (seed-e2e.ts) couvre les écrans. Certaines sondes veulent
 * une configuration précise qu'il serait faux d'imposer à tous les écrans :
 * un coloris « probe-noir » avec 15 photos, 30 articles « À comptabiliser », un
 * article TST1, un essai sans verifIA… Ces fonctions les ajoutent à la demande,
 * sans toucher au reste.
 *
 * À employer sur le compte « neuf » : le Studio et le stock y sont vides, donc
 * le nombre d'angles, de photos ou de lignes est exactement celui demandé (les
 * angles sont communs à tout le compte : sur « demo », 4 s'y ajouteraient déjà).
 * Tout est préfixé « e2e-sonde- » (ids) ou « SND » / « TST1 » (SKU) et s'efface
 * avec `retirerDonneesSonde`, ou d'un coup en relançant seedE2E.
 *
 *   semerSondeStudio       S1 à S5, S7, X0, X10, X12 (fiche coloris « probe-noir »)
 *   semerArticlesAComptabiliser   X1 (30 lignes dans la modale « Valider »)
 *   semerArticleTst1       O3, X5 (étape 2 de /mise-en-vente avec un article)
 *
 * Même garde que le seed : refuse toute base qui n'est pas locale.
 */

import { Prisma, type PrismaClient } from "@prisma/client";

import { nomPrise, promptVariante } from "@/lib/studioCases";
import { MODELE_MANUEL } from "@/lib/studioFiche";

import { verifierBaseLocale } from "./seed-e2e";

const HOTE_BLOB = "e2e.private.blob.vercel-storage.com";
const PREFIXE_ID = "e2e-sonde-";

/** Chaîne hexadécimale de 64 caractères, stable, tirée d'un entier (nom de fichier d'une référence). */
const empreinte = (n: number) => n.toString(16).padStart(8, "0").repeat(8);
/** UUID stable tiré d'un entier (nom de fichier d'une image générée). */
const uuid = (n: number) => `${n.toString(16).padStart(8, "0")}-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

export type OptionsSondeStudio = {
  /** Clé du coloris (défaut « probe-noir »). Hors catalogue SacBase : la fiche s'ouvre quand même, depuis la base. */
  cle?: string;
  /** Photos rangées, ordre 1 à N (défaut 15). */
  photos?: number;
  /** Prompts d'angle actifs (défaut 1). */
  angles?: number;
  /** Essais à juger AVEC verifIA (défaut 1), un par photo, sur le 1er angle. */
  aJuger?: number;
  /** Essais à juger SANS verifIA (défaut 0) : déclenchent la vérification à l'ouverture (X0, avec garde). */
  sansVerif?: number;
  /** Ajoute sur la photo 01 un essai REJETÉ à image conservée (id « e2e-sonde-essai-rej »), sur le 2e angle s'il existe (S4). */
  rejetSurPhoto1?: boolean;
  /** Ajoute un essai VALIDÉ sur la dernière photo (S2 : « photo déjà utilisée », le DELETE répond 409). */
  essaiValideSurDerniere?: boolean;
  /** Date de référence des createdAt (défaut maintenant). */
  maintenant?: Date;
};

const VERIF_SONDE: Prisma.InputJsonObject = {
  details: [{ detail: "Logo principal", statut: "fidele", note: "Conforme à la référence." }],
  angleRespecte: true,
  scoreGlobal: 90,
  verdict: "ok",
};

/** Un coloris de sonde avec ses photos, ses angles et ses essais. Renvoie les ids créés. */
export async function semerSondeStudio(
  prisma: PrismaClient,
  userId: string,
  opt: OptionsSondeStudio = {},
): Promise<{ colorisId: string; referenceIds: string[]; angleIds: string[]; essaiIds: string[] }> {
  verifierBaseLocale();
  const cle = opt.cle ?? "probe-noir";
  const photos = opt.photos ?? 15;
  const nbAngles = opt.angles ?? 1;
  const aJuger = opt.aJuger ?? 1;
  const sansVerif = opt.sansVerif ?? 0;
  const t0 = (opt.maintenant ?? new Date()).getTime();
  if (photos < 1 || photos > 15) throw new Error("Sonde Studio : 1 à 15 photos.");
  if (aJuger + sansVerif > photos) throw new Error("Sonde Studio : plus d'essais à juger que de photos.");

  const colorisId = `${PREFIXE_ID}coloris-${cle}`;
  await prisma.studioColoris.create({
    data: { id: colorisId, userId, cle, modele: "Sonde", coloris: "Noir", details: "Logo principal", createdAt: new Date(t0 - 86_400_000) },
  });

  const angleIds: string[] = [];
  for (let i = 1; i <= nbAngles; i++) {
    const id = `${PREFIXE_ID}angle-${i}`;
    angleIds.push(id);
    await prisma.studioAngle.create({
      data: { id, userId, nom: `Angle ${i}`, angle: `Angle: test view number ${i}.`, ordre: i, createdAt: new Date(t0 - 86_400_000 + i) },
    });
  }

  const referenceIds: string[] = [];
  for (let n = 1; n <= photos; n++) {
    const id = `${PREFIXE_ID}ref-${String(n).padStart(2, "0")}`;
    referenceIds.push(id);
    await prisma.studioReference.create({
      data: {
        id,
        userId,
        colorisId,
        origine: "studio",
        role: n === 1 ? "face" : "detail",
        urlImage: `https://${HOTE_BLOB}/references/${userId}/${empreinte(n + 100)}.jpg`,
        ordre: n,
        prise: nomPrise(n, "V1"),
        createdAt: new Date(t0 - 86_400_000 + n * 1000),
      },
    });
  }

  const essaiIds: string[] = [];
  let compteur = 0;
  const creerEssai = async (p: { id: string; photo: number; angle: number; numero: number; decision: "valide" | "rejete" | null; verif: boolean }) => {
    compteur += 1;
    essaiIds.push(p.id);
    await prisma.studioEssai.create({
      data: {
        id: p.id,
        colorisId,
        angleId: angleIds[p.angle],
        numero: p.numero,
        source: "manuel",
        modele: MODELE_MANUEL,
        promptUtilise: promptVariante("", `Angle: test view number ${p.angle + 1}.`),
        urlImage: `https://${HOTE_BLOB}/generees/${userId}/${uuid(compteur + 1000)}.png`,
        verifIA: p.verif ? VERIF_SONDE : Prisma.DbNull,
        decision: p.decision,
        referenceId: referenceIds[p.photo - 1],
        createdAt: new Date(t0 - 3_600_000 + compteur * 1000),
      },
    });
  };

  // Un essai par photo sur le 1er angle : le numéro court par (coloris, angle, modèle), pas par photo.
  let numero = 0;
  for (let i = 1; i <= aJuger; i++) await creerEssai({ id: `${PREFIXE_ID}essai-${i}`, photo: i, angle: 0, numero: ++numero, decision: null, verif: true });
  for (let i = 1; i <= sansVerif; i++) await creerEssai({ id: `${PREFIXE_ID}essai-sv-${i}`, photo: aJuger + i, angle: 0, numero: ++numero, decision: null, verif: false });
  if (opt.rejetSurPhoto1) {
    // Sur le 2e angle quand il existe : la case du 1er angle garde alors son essai à juger, celle-ci reste « Libre ».
    const angle = nbAngles > 1 ? 1 : 0;
    await creerEssai({ id: `${PREFIXE_ID}essai-rej`, photo: 1, angle, numero: angle === 0 ? ++numero : 1, decision: "rejete", verif: true });
  }
  if (opt.essaiValideSurDerniere) {
    await creerEssai({ id: `${PREFIXE_ID}essai-valide`, photo: photos, angle: 0, numero: ++numero, decision: "valide", verif: true });
  }

  return { colorisId, referenceIds, angleIds, essaiIds };
}

/** `n` articles « À comptabiliser » (SND1 à SNDn), sans commande : le dialogue « Valider » doit tenir avec 30 lignes (X1). */
export async function semerArticlesAComptabiliser(prisma: PrismaClient, userId: string, n = 30, maintenant: Date = new Date()): Promise<string[]> {
  verifierBaseLocale();
  const transporteurs = ["Mondial Relay", "Colissimo", "Vinted Go"];
  const skus: string[] = [];
  for (let i = 1; i <= n; i++) {
    skus.push(`SND${i}`);
    await prisma.article.create({
      data: {
        id: `${PREFIXE_ID}art-${i}`,
        sku: `SND${i}`,
        marque: "Sonde",
        categorie: "Polo",
        lot: "Sonde",
        statut: "À comptabiliser",
        prixAchat: 10,
        transporteur: transporteurs[i % transporteurs.length],
        compteVente: i % 2 === 0 ? "VINTED_PRO" : "VINTED_SECOND",
        dateMiseEnVente: new Date(maintenant.getTime() - (i + 5) * 86_400_000),
        createdAt: new Date(maintenant.getTime() - 40 * 86_400_000),
        userId,
      },
    });
  }
  return skus;
}

/** Un article TST1 « En stock », à chercher à l'étape SKU de /mise-en-vente (O3, X5). */
export async function semerArticleTst1(prisma: PrismaClient, userId: string, maintenant: Date = new Date()): Promise<void> {
  verifierBaseLocale();
  await prisma.article.create({
    data: {
      id: `${PREFIXE_ID}art-tst1`,
      sku: "TST1",
      marque: "Sonde",
      categorie: "Polo",
      lot: "Sonde",
      statut: "En stock",
      prixAchat: 10,
      createdAt: new Date(maintenant.getTime() - 40 * 86_400_000),
      userId,
    },
  });
}

/** Efface ce que les fonctions ci-dessus ont semé (ids « e2e-sonde- »), sans toucher au reste du compte. */
export async function retirerDonneesSonde(prisma: PrismaClient, userId: string): Promise<void> {
  verifierBaseLocale();
  const aMoi = { startsWith: PREFIXE_ID };
  await prisma.studioEssai.deleteMany({ where: { id: aMoi, coloris: { userId } } });
  await prisma.studioReference.deleteMany({ where: { id: aMoi, userId } });
  await prisma.studioAngle.deleteMany({ where: { id: aMoi, userId } });
  await prisma.studioColoris.deleteMany({ where: { id: aMoi, userId } });
  await prisma.article.deleteMany({ where: { id: aMoi, userId } });
}
