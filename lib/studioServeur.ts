import "server-only";
import { prisma } from "@/lib/prisma";
import { regrouperParCleStudio } from "@/lib/studioAlias";
import { whereImagesValidees } from "@/lib/studioAnnonce";
import { nomPrise, sacsCibles } from "@/lib/studioCases";
import { sacsChezToi, type SacChezToi } from "@/lib/studioChezToi";
import { buildSkuIndex, getColoris, type SacbaseCatalogue, type SacbaseColoris, type SacbaseColorisSource } from "@/lib/studioColoris";
import { planRattachement } from "@/lib/studioFiche";
import { libelleRetouche, retoucheDeCopie } from "@/lib/studioRetouche";
import type { VersionUn } from "@/lib/studioVersion";
import { SELECT_VERSION, versionEnBase } from "@/lib/studioVersionLecture";

/**
 * Lectures et écritures du Studio en base. Toutes scopées par userId.
 *
 * ⚠️ Cloisonnement (spec §7) : ce module n'écrit jamais `Article`. Il le LIT
 * pour le statut des sacs d'un coloris (sac « chez toi », sac à préparer) et
 * pour le texte de l'annonce actuelle (la Version 1).
 *
 * La génération d'images IA a été retirée le 17/11/2026 : les tables
 * `StudioEssai` (images IA validées, toujours lues pour les annonces),
 * `StudioAngle`, `StudioEchec`, `StudioModeleFavori` et `StudioReglages`
 * restent en base, sans écriture.
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

/**
 * Les SKU de la liste qui ont au moins une image validée pour leur annonce : la
 * même règle que GET /api/studio/annonce (`whereImagesValidees`).
 */
export async function skusAvecImageValidee(userId: string, skus: readonly string[]): Promise<Set<string>> {
  if (skus.length === 0) return new Set();
  const lignes = await prisma.studioEssai.findMany({
    where: whereImagesValidees(userId, { in: [...new Set(skus)] }),
    select: { skuCible: true },
    distinct: ["skuCible"],
  });
  return new Set(lignes.flatMap((l) => (l.skuCible ? [l.skuCible] : [])));
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
  /** Sacs de ce coloris connus de SacBase, vendus ou non ; null hors catalogue. */
  nbSacs: number | null;
  /** Vraies photos du tableau (prises numérotées). */
  prises: number;
  /** Toutes les vraies photos déjà importées pour ce coloris, tableau ou non (celles de la mise en vente n'ont pas de ligne). */
  photos: number;
  /** Prochain sac à préparer : le premier sac sans annonce. */
  prochain: string | null;
};

export type DonneesGrille = {
  sacbase: EtatSacbase;
  cartes: CarteColoris[];
  /** Les sacs chez toi, un par SKU, avec ce qu'il leur manque (vue « chez toi » de l'accueil). Vide sans catalogue. */
  sacs: SacChezToi[];
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
  const skusCatalogue = catalogue.flatMap((c) => c.sacs.map((s) => s.sku));

  const [lignesEnBase, orphelines, statuts, skusValides] = await Promise.all([
    prisma.studioColoris.findMany({
      where: { userId },
      select: {
        cle: true,
        modele: true,
        coloris: true,
        // Toutes les photos, pas seulement celles du tableau : une photo gardée à la mise en vente (ordre null) prouve aussi qu'on a photographié ce coloris.
        references: { select: { id: true, ordre: true, copieDeId: true } },
      },
    }),
    prisma.studioReference.count({ where: { userId, colorisId: null } }),
    statutsDesSkus(userId, skusCatalogue),
    skusAvecImageValidee(userId, skusCatalogue),
  ]);
  // Alias du Studio (lib/studioAlias.ts) : une ligne 5883 encore en base compte pour 5880, jamais comme carte à part.
  const enBase = regrouperParCleStudio(lignesEnBase);
  const statutDe = (sku: string) => statuts.get(sku) ?? null;
  const parCle = new Map(enBase.map((c) => [c.cle, c]));

  const compter = (b: (typeof enBase)[number] | undefined) => {
    if (!b) return { prises: 0, photos: 0 };
    return {
      prises: b.references.filter((r) => r.ordre !== null).length,
      // Les copies retouchées ne sont pas des photos de plus : ce sont des rendus d'une photo déjà comptée.
      photos: b.references.filter((r) => r.copieDeId === null).length,
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
      nbSacs: c.sacs.length,
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
      nbSacs: null,
      prochain: null,
      ...compter(b),
    });
  }
  cartes.sort((a, b) => a.cle.localeCompare(b.cle, "fr", { numeric: true }));

  // Le catalogue est celui du Studio (alias déjà fusionné) : SDN60 sort sous 5880, avec les photos de la carte 5880.
  const sacs = sacsChezToi(catalogue, cartes, skusValides, statutDe);

  return { sacbase: etatDe(source), cartes, sacs, orphelines, rattachees };
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

  const [lignes, copies, servies, versions] = await Promise.all([
    prisma.studioReference.findMany({
      where: { userId, colorisId: coloris.id, ordre: { not: null } },
      orderBy: [{ ordre: "asc" }, { createdAt: "asc" }],
      select: { id: true, ordre: true, prise: true, sku: true },
    }),
    // Les copies retouchées : jamais des lignes du tableau (ordre null). Hors version, elles s'affichent sous leur photo.
    prisma.studioReference.findMany({
      where: { userId, colorisId: coloris.id, copieDeId: { not: null } },
      orderBy: [{ createdAt: "asc" }],
      select: { id: true, copieDeId: true, angleCopie: true, retouche: true, _count: { select: { versionPhotos: true } } },
    }),
    // Les photos dont une ancienne image IA a été tirée (essai en RESTRICT) : ni retrait ni remplacement.
    prisma.studioEssai.findMany({
      where: { colorisId: coloris.id, coloris: { userId }, referenceId: { not: null } },
      select: { referenceId: true },
      distinct: ["referenceId"],
    }),
    prisma.studioVersion.findMany({ where: { userId, colorisId: coloris.id }, orderBy: { numero: "asc" }, select: SELECT_VERSION }),
  ]);

  // Les noms de prise dépendent de la génération du sac (les V3 ont leur liste) :
  // une photo importée avant que sa génération ne soit connue est renommée ici,
  // pour que la planche et l'annonce lisent le bon nom.
  const generation = duCatalogue?.generation ?? null;
  if (generation) {
    const aRenommer = lignes.filter((l) => l.ordre !== null && l.prise !== nomPrise(l.ordre, generation));
    if (aRenommer.length > 0) {
      await prisma.$transaction(
        aRenommer.map((l) => prisma.studioReference.update({ where: { id: l.id }, data: { prise: nomPrise(l.ordre as number, generation) } })),
      );
      for (const l of aRenommer) l.prise = nomPrise(l.ordre as number, generation);
    }
  }

  const sacs = duCatalogue?.sacs ?? [];
  const versionsUn = await chargerVersionsUn(
    userId,
    sacs.map((s) => s.sku),
  );
  const statuts = await statutsDesSkus(
    userId,
    sacs.map((s) => s.sku),
  );
  const statutDe = (sku: string) => statuts.get(sku) ?? null;

  return {
    sacbase: etatDe(source),
    coloris: { id: coloris.id, cle: coloris.cle, modele: coloris.modele, coloris: coloris.coloris },
    generation,
    vignette: duCatalogue?.image ? `/api/studio/vignette?cle=${encodeURIComponent(cle)}` : null,
    sacs: sacs.map((s) => ({ sku: s.sku, statut: statutDe(s.sku) ?? s.statut, vendu: s.vendu })),
    cibles: sacsCibles(sacs, statutDe),
    lignes: lignes.map((l) => ({ id: l.id, ordre: l.ordre as number, prise: l.prise })),
    /** Photos de la planche dont une ancienne image IA a été tirée : elles ne se retirent ni ne se remplacent. */
    servies: servies.flatMap((e) => (e.referenceId ? [e.referenceId] : [])),
    // Sur la planche, seulement les copies qu'aucune version ne montre (les autres sont dans « Versions »).
    copies: copies.flatMap((c) => {
      const retouche = retoucheDeCopie(c);
      return c.copieDeId && retouche && c._count.versionPhotos === 0 ? [{ id: c.id, copieDeId: c.copieDeId, libelle: libelleRetouche(retouche) }] : [];
    }),
    /** Photos de la planche qu'une version montre (elle-même ou une de ses copies) : elles ne se retirent plus. */
    photosEnVersion: [...photosMontrees(versions, copies)],
    /** Versions 2, 3… du coloris, et la Version 1 (état actuel de l'annonce) de chaque sac. */
    versions: versions.map(versionEnBase),
    versionsUn,
  };
}

export type DonneesFiche = NonNullable<Awaited<ReturnType<typeof chargerFiche>>>;

/** Les vraies photos qu'une version montre, directement ou par une de leurs copies. */
function photosMontrees(
  versions: readonly { photos: readonly { referenceId: string }[] }[],
  copies: readonly { id: string; copieDeId: string | null }[],
): Set<string> {
  const copieDe = new Map(copies.map((c) => [c.id, c.copieDeId]));
  return new Set(versions.flatMap((v) => v.photos.map((p) => copieDe.get(p.referenceId) ?? p.referenceId)));
}

/**
 * La Version 1 de chaque sac : l'état actuel de son annonce, RELU (jamais
 * stocké) — titre, description à tirets et mots-clés de son `Article` (lecture
 * seule), et les images validées pour lui, par la règle unique de l'annonce
 * (`whereImagesValidees`), dans l'ordre des prises.
 */
export async function chargerVersionsUn(userId: string, skus: readonly string[]): Promise<VersionUn[]> {
  if (skus.length === 0) return [];
  const [articles, valides] = await Promise.all([
    prisma.article.findMany({
      where: { userId, sku: { in: [...new Set(skus)] } },
      select: { sku: true, titreAnnonce: true, descriptionAnnonce: true, motsClesAnnonce: true },
    }),
    prisma.studioEssai.findMany({
      where: whereImagesValidees(userId, { in: [...new Set(skus)] }),
      select: { id: true, skuCible: true, createdAt: true, reference: { select: { ordre: true } } },
    }),
  ]);
  const parSku = new Map(articles.map((a) => [a.sku, a]));
  return skus.map((sku) => {
    const a = parSku.get(sku);
    const photos = valides
      .filter((e) => e.skuCible === sku)
      .sort((x, y) => (x.reference?.ordre ?? 0) - (y.reference?.ordre ?? 0) || +x.createdAt - +y.createdAt)
      .map((e) => e.id);
    return { sku, titre: a?.titreAnnonce ?? "", description: a?.descriptionAnnonce ?? "", motsCles: a?.motsClesAnnonce ?? "", photos };
  });
}
