import "server-only";
import { prisma } from "@/lib/prisma";
import { ANGLES_AMORCAGE } from "@/lib/studioAngles";
import { buildSkuIndex, getColoris, type SacbaseCatalogue, type SacbaseColoris, type SacbaseColorisSource } from "@/lib/studioColoris";
import { avancement, planRattachement, type Avancement } from "@/lib/studioFiche";

/**
 * Lectures et écritures du Studio IA en base. Toutes scopées par userId.
 *
 * ⚠️ Cloisonnement (spec §7) : ce module ne lit ni n'écrit `Article`. La seule
 * question posée au stock — « ce SKU est-il un sac Hipobuy ? » — est posée par
 * la route des références, en lecture, avec `whereSacbase`.
 */

/** Amorce les 7 modèles d'angle au premier passage d'un compte. */
export async function assurerAngles(userId: string): Promise<void> {
  const n = await prisma.studioAngle.count({ where: { userId } });
  if (n > 0) return;
  await prisma.studioAngle.createMany({
    data: ANGLES_AMORCAGE.map((a) => ({ ...a, userId })),
  });
}

/** Crée le coloris à la première référence ou à la première ouverture (spec §4). */
export function assurerColoris(userId: string, c: Pick<SacbaseColoris, "cle" | "modele" | "coloris">) {
  return prisma.studioColoris.upsert({
    where: { userId_cle: { userId, cle: c.cle } },
    // Le libellé suit SacBase s'il change ; les détails saisis ne sont jamais écrasés.
    update: { modele: c.modele, coloris: c.coloris },
    create: { userId, cle: c.cle, modele: c.modele, coloris: c.coloris },
  });
}

/**
 * Rattache les photos gardées « non rattachées » dont le SKU est maintenant
 * connu (spec §4 : « rattachée au prochain passage »). Rend le nombre rattaché.
 */
export async function rattacherOrphelines(userId: string, catalogue: SacbaseCatalogue): Promise<number> {
  const orphelines = await prisma.studioReference.findMany({
    where: { userId, colorisId: null, sku: { not: null } },
    select: { id: true, sku: true },
  });
  if (orphelines.length === 0) return 0;
  const plan = planRattachement(orphelines, buildSkuIndex(catalogue));
  if (plan.length === 0) return 0;

  const parCle = new Map(catalogue.coloris.map((c) => [c.cle, c]));
  const idsParCle = new Map<string, string[]>();
  for (const p of plan) idsParCle.set(p.cle, [...(idsParCle.get(p.cle) ?? []), p.id]);

  let n = 0;
  for (const [cle, ids] of idsParCle) {
    const c = parCle.get(cle);
    if (!c) continue;
    const coloris = await assurerColoris(userId, c);
    const res = await prisma.studioReference.updateMany({
      where: { userId, id: { in: ids }, colorisId: null },
      data: { colorisId: coloris.id },
    });
    n += res.count;
  }
  return n;
}

export type EtatSacbase =
  | { kind: "live" }
  | { kind: "stale"; error: string; fetchedAt: number }
  | { kind: "off"; reason: "non-configure" | "injoignable" };

function etatDe(source: SacbaseColorisSource): EtatSacbase {
  if (source.kind === "live") return { kind: "live" };
  if (source.kind === "stale") return { kind: "stale", error: source.error, fetchedAt: source.fetchedAt };
  return { kind: "off", reason: source.reason };
}

export type LigneGrille = {
  cle: string;
  modele: string;
  coloris: string;
  /** Vignette du catalogue SacBase, repère d'affichage seulement. null hors catalogue. */
  image: string | null;
  chezMoi: number | null;
  sacs: number | null;
  avancement: Avancement;
};

export type DonneesGrille = {
  sacbase: EtatSacbase;
  /** URL publique de SacBase pour les vignettes, null si inconnue. */
  sacbaseUrl: string | null;
  lignes: LigneGrille[];
  orphelines: number;
  rattachees: number;
};

/**
 * La grille /studio : tous les coloris du catalogue SacBase, plus ceux déjà
 * connus en base (pour que le Studio reste utilisable quand SacBase tombe).
 */
export async function chargerGrille(userId: string): Promise<DonneesGrille> {
  const source = await getColoris();
  const rattachees = source.kind === "off" ? 0 : await rattacherOrphelines(userId, source.data);

  const [enBase, orphelines] = await Promise.all([
    prisma.studioColoris.findMany({
      where: { userId },
      select: {
        cle: true,
        modele: true,
        coloris: true,
        _count: { select: { references: true } },
        essais: { select: { angleId: true, decision: true, verifIA: true } },
      },
    }),
    prisma.studioReference.count({ where: { userId, colorisId: null } }),
  ]);
  const parCle = new Map(enBase.map((c) => [c.cle, c]));

  const lignes: LigneGrille[] = [];
  const vus = new Set<string>();
  if (source.kind !== "off") {
    for (const c of source.data.coloris) {
      const b = parCle.get(c.cle);
      vus.add(c.cle);
      lignes.push({
        cle: c.cle,
        modele: c.modele,
        coloris: c.coloris,
        image: c.image || null,
        chezMoi: c.chezMoi,
        sacs: c.sacs.length,
        avancement: avancement(b?._count.references ?? 0, b?.essais ?? []),
      });
    }
  }
  for (const b of enBase) {
    if (vus.has(b.cle)) continue;
    lignes.push({
      cle: b.cle,
      modele: b.modele,
      coloris: b.coloris,
      image: null,
      chezMoi: null,
      sacs: null,
      avancement: avancement(b._count.references, b.essais),
    });
  }
  lignes.sort((a, b) => a.cle.localeCompare(b.cle, "fr", { numeric: true }));

  return {
    sacbase: etatDe(source),
    sacbaseUrl: process.env.SACBASE_URL?.trim().replace(/\/+$/, "") || null,
    lignes,
    orphelines,
    rattachees,
  };
}

/**
 * La fiche d'un coloris. Crée la ligne `StudioColoris` à la première ouverture
 * si SacBase connaît la clé. null si la clé n'est connue ni de SacBase ni de la base.
 */
export async function chargerFiche(userId: string, cle: string) {
  const source = await getColoris();
  if (source.kind !== "off") await rattacherOrphelines(userId, source.data);
  const duCatalogue = source.kind === "off" ? undefined : source.data.coloris.find((c) => c.cle === cle);

  let coloris = await prisma.studioColoris.findUnique({ where: { userId_cle: { userId, cle } } });
  if (!coloris && duCatalogue) coloris = await assurerColoris(userId, duCatalogue);
  if (!coloris) return null;

  await assurerAngles(userId);
  const [references, angles, essais] = await Promise.all([
    prisma.studioReference.findMany({
      where: { userId, colorisId: coloris.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, role: true, sku: true, origine: true, createdAt: true },
    }),
    prisma.studioAngle.findMany({ where: { userId }, orderBy: [{ ordre: "asc" }, { createdAt: "asc" }] }),
    prisma.studioEssai.findMany({
      where: { colorisId: coloris.id, coloris: { userId } },
      orderBy: [{ angleId: "asc" }, { modele: "asc" }, { numero: "asc" }],
      select: {
        id: true,
        angleId: true,
        numero: true,
        source: true,
        modele: true,
        coutEstimeUsd: true,
        coutReelUsd: true,
        lancementId: true,
        essaiParentId: true,
        promptUtilise: true,
        verifIA: true,
        decision: true,
        createdAt: true,
        urlImage: true,
      },
    }),
  ]);

  return {
    sacbase: etatDe(source),
    coloris: { id: coloris.id, cle: coloris.cle, modele: coloris.modele, coloris: coloris.coloris, details: coloris.details },
    catalogue: duCatalogue ? { chezMoi: duCatalogue.chezMoi, sacs: duCatalogue.sacs } : null,
    references,
    angles: angles.map((a) => ({ id: a.id, nom: a.nom, roleReference: a.roleReference, angle: a.angle, ordre: a.ordre })),
    // L'URL privée du blob ne sort pas du serveur : l'écran passe par /api/studio/image.
    essais: essais.map(({ urlImage, ...e }) => ({ ...e, purge: !urlImage })),
  };
}

export type DonneesFiche = NonNullable<Awaited<ReturnType<typeof chargerFiche>>>;

/** Les essais du compte, pour le bilan, avec les libellés des angles et des coloris. */
export async function chargerBilan(userId: string) {
  const [essais, echecs, angles, coloris] = await Promise.all([
    prisma.studioEssai.findMany({
      where: { coloris: { userId } },
      select: { colorisId: true, angleId: true, numero: true, decision: true, verifIA: true, modele: true, coutReelUsd: true },
    }),
    prisma.studioEchec.findMany({ where: { userId }, select: { modele: true, code: true, coutReelUsd: true } }),
    prisma.studioAngle.findMany({ where: { userId }, select: { id: true, nom: true, ordre: true } }),
    prisma.studioColoris.findMany({ where: { userId }, select: { id: true, cle: true, modele: true, coloris: true } }),
  ]);
  return { essais, echecs, angles, coloris };
}
