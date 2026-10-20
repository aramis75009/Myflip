import "server-only";
import { prisma } from "@/lib/prisma";
import { cleCase, etatsDesCases, sacsCibles, usageAngles, type EtatCase } from "@/lib/studioCases";
import { buildSkuIndex, getColoris, type SacbaseCatalogue, type SacbaseColoris, type SacbaseColorisSource } from "@/lib/studioColoris";
import { planRattachement } from "@/lib/studioFiche";

/**
 * Lectures et écritures du Studio en base. Toutes scopées par userId.
 *
 * ⚠️ Cloisonnement (spec §7) : ce module n'écrit jamais `Article`. Il le LIT
 * pour une seule question — le statut des sacs d'un coloris — parce qu'une
 * case se verrouille quand le sac qui l'a reçue a son annonce (règle du 20/10).
 */

/** Statut MyFlip de chaque SKU demandé (lecture seule). Un SKU absent du stock n'y figure pas. */
export async function statutsDesSkus(userId: string, skus: readonly string[]): Promise<Map<string, string>> {
  if (skus.length === 0) return new Map();
  const lignes = await prisma.article.findMany({
    where: { userId, sku: { in: [...new Set(skus)] } },
    select: { sku: true, statut: true },
  });
  return new Map(lignes.map((l) => [l.sku, l.statut]));
}

/** Prompts d'angle actifs (colonnes du tableau), dans l'ordre. */
export function anglesActifs(userId: string) {
  return prisma.studioAngle.findMany({
    where: { userId, archiveLe: null },
    orderBy: [{ ordre: "asc" }, { createdAt: "asc" }],
    select: { id: true, nom: true, angle: true, ordre: true },
  });
}

export async function lirePromptMaitre(userId: string): Promise<{ texte: string; modifieLe: Date | null }> {
  const r = await prisma.studioReglages.findUnique({ where: { userId }, select: { promptMaitre: true, updatedAt: true } });
  return { texte: r?.promptMaitre ?? "", modifieLe: r?.updatedAt ?? null };
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

export type CarteColoris = {
  cle: string;
  modele: string;
  coloris: string;
  /** « V1 », « V2 », « V3 », ou null si SacBase ne la donne pas. */
  generation: string | null;
  /** La vignette passe par /api/studio/vignette (SacBase protège /img). null hors catalogue. */
  vignette: string | null;
  chezMoi: number | null;
  vendus: number | null;
  /** Vraies photos du tableau (prises numérotées). */
  prises: number;
  /** Cases libres / cases du tableau (prises × prompts d'angle actifs). */
  libres: number;
  cases: number;
  aJuger: number;
  /** Prochain sac à préparer : le premier sac sans annonce. */
  prochain: string | null;
};

export type DonneesGrille = {
  sacbase: EtatSacbase;
  cartes: CarteColoris[];
  nbAngles: number;
  orphelines: number;
  rattachees: number;
};

/**
 * L'accueil /studio : tous les coloris du catalogue SacBase, plus ceux déjà
 * connus en base (pour que le Studio reste utilisable quand SacBase tombe).
 */
export async function chargerGrille(userId: string): Promise<DonneesGrille> {
  const source = await getColoris();
  const rattachees = source.kind === "off" ? 0 : await rattacherOrphelines(userId, source.data);
  const catalogue = source.kind === "off" ? [] : source.data.coloris;

  const [enBase, angles, orphelines, statuts] = await Promise.all([
    prisma.studioColoris.findMany({
      where: { userId },
      select: {
        cle: true,
        modele: true,
        coloris: true,
        references: { where: { ordre: { not: null } }, select: { id: true } },
        essais: { select: { referenceId: true, angleId: true, decision: true, skuCible: true } },
      },
    }),
    anglesActifs(userId),
    prisma.studioReference.count({ where: { userId, colorisId: null } }),
    statutsDesSkus(userId, catalogue.flatMap((c) => c.sacs.map((s) => s.sku))),
  ]);
  const statutDe = (sku: string) => statuts.get(sku) ?? null;
  const parCle = new Map(enBase.map((c) => [c.cle, c]));

  const compter = (b: (typeof enBase)[number] | undefined) => {
    if (!b) return { prises: 0, libres: 0, cases: 0, aJuger: 0 };
    const etats = etatsDesCases(b.references, angles, b.essais, statutDe);
    let libres = 0;
    for (const e of etats.values()) if (e.kind === "libre") libres++;
    return {
      prises: b.references.length,
      libres,
      cases: etats.size,
      // Les essais du banc de test (sans photo de ligne) ne se jugent plus dans la fiche.
      aJuger: b.essais.filter((e) => e.referenceId && e.decision === null).length,
    };
  };

  const cartes: CarteColoris[] = [];
  const vus = new Set<string>();
  for (const c of catalogue) {
    vus.add(c.cle);
    cartes.push({
      cle: c.cle,
      modele: c.modele,
      coloris: c.coloris,
      generation: c.generation,
      vignette: c.image ? `/api/studio/vignette?cle=${encodeURIComponent(c.cle)}` : null,
      chezMoi: c.chezMoi,
      vendus: c.sacs.filter((s) => s.vendu).length,
      prochain: sacsCibles(c.sacs, statutDe)[0] ?? null,
      ...compter(parCle.get(c.cle)),
    });
  }
  for (const b of enBase) {
    if (vus.has(b.cle)) continue;
    cartes.push({
      cle: b.cle,
      modele: b.modele,
      coloris: b.coloris,
      generation: null,
      vignette: null,
      chezMoi: null,
      vendus: null,
      prochain: null,
      ...compter(b),
    });
  }
  cartes.sort((a, b) => a.cle.localeCompare(b.cle, "fr", { numeric: true }));

  return { sacbase: etatDe(source), cartes, nbAngles: angles.length, orphelines, rattachees };
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

  const [lignes, angles, essais, promptMaitre] = await Promise.all([
    prisma.studioReference.findMany({
      where: { userId, colorisId: coloris.id, ordre: { not: null } },
      orderBy: [{ ordre: "asc" }, { createdAt: "asc" }],
      select: { id: true, ordre: true, prise: true, sku: true },
    }),
    anglesActifs(userId),
    prisma.studioEssai.findMany({
      where: { colorisId: coloris.id, coloris: { userId }, referenceId: { not: null } },
      orderBy: [{ createdAt: "asc" }],
      select: {
        id: true,
        referenceId: true,
        angleId: true,
        numero: true,
        source: true,
        modele: true,
        coutEstimeUsd: true,
        coutReelUsd: true,
        essaiParentId: true,
        promptUtilise: true,
        verifIA: true,
        decision: true,
        skuCible: true,
        createdAt: true,
        urlImage: true,
      },
    }),
    lirePromptMaitre(userId),
  ]);

  const sacs = duCatalogue?.sacs ?? [];
  const statuts = await statutsDesSkus(userId, [...sacs.map((s) => s.sku), ...essais.flatMap((e) => (e.skuCible ? [e.skuCible] : []))]);
  const statutDe = (sku: string) => statuts.get(sku) ?? null;
  const etats = etatsDesCases(lignes, angles, essais, statutDe);
  const cases: Record<string, EtatCase> = {};
  for (const l of lignes) for (const a of angles) cases[cleCase(l.id, a.id)] = etats.get(cleCase(l.id, a.id))!;

  return {
    sacbase: etatDe(source),
    coloris: { id: coloris.id, cle: coloris.cle, modele: coloris.modele, coloris: coloris.coloris, details: coloris.details },
    generation: duCatalogue?.generation ?? null,
    vignette: duCatalogue?.image ? `/api/studio/vignette?cle=${encodeURIComponent(cle)}` : null,
    sacs: sacs.map((s) => ({ sku: s.sku, statut: statutDe(s.sku) ?? s.statut, vendu: s.vendu })),
    cibles: sacsCibles(sacs, statutDe),
    lignes: lignes.map((l) => ({ id: l.id, ordre: l.ordre as number, prise: l.prise })),
    angles,
    cases,
    promptMaitre: promptMaitre.texte,
    // L'URL privée du blob ne sort pas du serveur : l'écran passe par /api/studio/image.
    essais: essais.map(({ urlImage, referenceId, ...e }) => ({ ...e, referenceId: referenceId as string, purge: !urlImage })),
  };
}

export type DonneesFiche = NonNullable<Awaited<ReturnType<typeof chargerFiche>>>;

/** L'onglet Studio de /parametres : prompt maître, prompts d'angle actifs et leur utilisation. */
export async function chargerPromptsStudio(userId: string) {
  const [maitre, angles, essais] = await Promise.all([
    lirePromptMaitre(userId),
    anglesActifs(userId),
    prisma.studioEssai.findMany({
      where: { coloris: { userId }, angle: { archiveLe: null } },
      select: { colorisId: true, referenceId: true, angleId: true, decision: true, skuCible: true },
    }),
  ]);
  const usage = usageAngles(essais);
  return {
    promptMaitre: maitre.texte,
    modifieLe: maitre.modifieLe?.toISOString() ?? null,
    angles: angles.map((a) => ({ ...a, cases: usage.get(a.id)?.cases ?? 0, skus: usage.get(a.id)?.skus ?? [] })),
  };
}

export type DonneesPromptsStudio = Awaited<ReturnType<typeof chargerPromptsStudio>>;

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
