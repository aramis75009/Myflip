import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized, notFound } from "@/lib/apiAuth";
import { deriveVente, STATUT_VENDU, STATUTS } from "@/lib/calc";
import { toDTO } from "@/lib/serialize";
import { parseCompteVentePatch } from "@/lib/comptesVente";
import { dateMiseEnVenteAEcrire, parseDatePatch } from "@/lib/dateMiseEnVente";

type PatchBody = {
  sku?: string;
  marque?: string;
  categorie?: string;
  /** Libellé du lot d'achat. Éditable : corriger la marque d'un article
   *  laissait jusqu'ici un libellé de lot périmé, irréparable depuis l'UI. */
  lot?: string | null;
  grade?: string | null;
  statut?: string;
  prixAchat?: number;
  prixVente?: number | null;
  dateVente?: string | null;
  /** Correction à la main de la première mise en ligne (« AAAA-MM-JJ » ou ISO). */
  dateMiseEnVente?: string | null;
  canal?: string | null;
  titreAnnonce?: string | null;
  descriptionAnnonce?: string | null;
  motsClesAnnonce?: string | null;
  /** Compte Vinted choisi AVANT la vente (fiche de mise en vente, Stock).
   *  Absent = inchangé, null = effacé, autre valeur hors enum = 400. */
  compteVente?: string | null;
};

// PATCH /api/articles/[id] — édition inline + transitions de statut
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const userId = await getUserId();
  if (!userId) return unauthorized();

  try {
    const body = (await req.json()) as PatchBody;

    // findFirst et non findUnique : le userId fait partie du critère, donc
    // l'article d'un autre compte est indiscernable d'un id inexistant.
    const existing = await prisma.article.findFirst({
      where: { id: params.id, userId },
    });
    if (!existing) return notFound("Article");

    // Champs « texte » directement éditables.
    const data: Record<string, unknown> = {};
    if (body.sku !== undefined) {
      const sku = body.sku.trim();
      if (!sku)
        return NextResponse.json({ error: "SKU vide." }, { status: 400 });
      data.sku = sku;
    }
    if (body.marque !== undefined) data.marque = body.marque.trim();
    if (body.categorie !== undefined) data.categorie = body.categorie.trim();
    // Chaîne vide = on efface le libellé, pas on l'écrase par du blanc :
    // l'article retombe alors sur le nom du lot rattaché à l'affichage.
    if (body.lot !== undefined)
      data.lot = body.lot ? String(body.lot).trim() || null : null;
    if (body.grade !== undefined)
      data.grade = body.grade ? String(body.grade).trim() : null;
    if (body.canal !== undefined)
      data.canal = body.canal ? String(body.canal).trim() : null;
    if (body.titreAnnonce !== undefined)
      data.titreAnnonce = body.titreAnnonce ? String(body.titreAnnonce) : null;
    if (body.descriptionAnnonce !== undefined)
      data.descriptionAnnonce = body.descriptionAnnonce
        ? String(body.descriptionAnnonce)
        : null;
    if (body.motsClesAnnonce !== undefined)
      data.motsClesAnnonce = body.motsClesAnnonce
        ? String(body.motsClesAnnonce)
        : null;

    const compte = parseCompteVentePatch(body.compteVente);
    if (!compte.ok)
      return NextResponse.json({ error: compte.error }, { status: 400 });
    if (compte.change) data.compteVente = compte.value;

    if (body.statut !== undefined && !STATUTS.includes(body.statut as never)) {
      return NextResponse.json({ error: "Statut invalide." }, { status: 400 });
    }

    // Valeurs effectives après fusion pour recalcul des dérivés.
    const statut = body.statut ?? existing.statut;
    const prixAchat =
      body.prixAchat !== undefined ? Number(body.prixAchat) : existing.prixAchat;
    if (Number.isNaN(prixAchat) || prixAchat < 0) {
      return NextResponse.json(
        { error: "Prix d'achat invalide." },
        { status: 400 },
      );
    }

    const prixVente =
      body.prixVente !== undefined
        ? body.prixVente === null
          ? null
          : Number(body.prixVente)
        : existing.prixVente;
    if (prixVente != null && (Number.isNaN(prixVente) || prixVente < 0)) {
      return NextResponse.json(
        { error: "Prix de vente invalide." },
        { status: 400 },
      );
    }

    // Même garde que la date de mise en vente : une année aberrante (saisie
    // au clavier en cours) sortirait hors format vers SacBase.
    const venteSaisie = parseDatePatch(body.dateVente);
    if (!venteSaisie.ok)
      return NextResponse.json({ error: "Date de vente invalide." }, { status: 400 });
    const dateVente = venteSaisie.change ? venteSaisie.value : existing.dateVente;

    // Passage à « Vendu » sans prix → refus (le client doit ouvrir le modal).
    if (statut === STATUT_VENDU && prixVente == null) {
      return NextResponse.json(
        { error: "Un prix de vente est requis pour marquer l'article vendu." },
        { status: 400 },
      );
    }

    const saisie = parseDatePatch(body.dateMiseEnVente);
    if (!saisie.ok)
      return NextResponse.json({ error: "Date de mise en vente invalide." }, { status: 400 });
    // Premier passage en « En vente » : date du jour. Une saisie à la main
    // l'emporte, et une date déjà posée n'est jamais écrasée.
    const miseEnVente = dateMiseEnVenteAEcrire({
      statutAvant: existing.statut,
      statut,
      dateActuelle: existing.dateMiseEnVente,
      ...(saisie.change ? { saisie: saisie.value } : {}),
    });
    if (miseEnVente !== undefined) data.dateMiseEnVente = miseEnVente;

    const derived = deriveVente({ statut, prixAchat, prixVente, dateVente });

    data.statut = statut;
    data.prixAchat = prixAchat;
    data.prixVente = derived.prixVente;
    data.dateVente = derived.dateVente;
    data.margeBrute = derived.margeBrute;
    data.margeNette = derived.margeNette;
    data.coefficient = derived.coefficient;

    // L'appartenance vient d'être vérifiée par le findFirst ci-dessus, donc
    // cibler par id seul est sûr — et `update` exige un critère unique.
    const updated = await prisma.article.update({
      where: { id: params.id },
      data,
      include: { commande: true },
    });

    return NextResponse.json(toDTO(updated));
  } catch (err: unknown) {
    // Conflit de SKU unique
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Ce SKU existe déjà." },
        { status: 409 },
      );
    }
    console.error("PATCH /api/articles/[id]", err);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour de l'article." },
      { status: 500 },
    );
  }
}

// DELETE /api/articles/[id]
export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const userId = await getUserId();
  if (!userId) return unauthorized();

  try {
    // deleteMany plutôt que delete : le userId entre dans le critère, donc la
    // vérification d'appartenance et la suppression sont une seule opération
    // atomique. `count` à 0 = id inconnu ou appartenant à un autre compte.
    const res = await prisma.article.deleteMany({
      where: { id: params.id, userId },
    });
    if (res.count === 0) return notFound("Article");

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/articles/[id]", err);
    return NextResponse.json(
      { error: "Erreur lors de la suppression de l'article." },
      { status: 500 },
    );
  }
}
