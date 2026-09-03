// POST /api/hermes/commandes — crée une commande et ses lots pour l'agent Hermes.
//
// Même code métier que le formulaire « Nouvelle commande » : la création passe
// par `creerCommande` (lib/commandes.ts). Cette route n'est qu'un traducteur
// entre le vocabulaire d'Hermes (« au_lot », « nombrePieces », « prixLot ») et
// celui du domaine (« LOT », « quantite », « prixTotal »). Aucun calcul de SKU
// ni de prorata de port n'est refait ici — c'est tout l'intérêt.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authentifierHermes } from "@/lib/hermesAuth";
import { erreurHermes, lirePagination } from "@/lib/hermesApi";
import { creerCommande, toCommandeDTO } from "@/lib/commandes";
import type { CommandeBody, LotBody } from "@/lib/commandes";

export const dynamic = "force-dynamic";

// GET /api/hermes/commandes — les commandes récentes, les plus fraîches d'abord.
//
// Sert d'abord à ne pas créer deux fois la même commande : avant de poster,
// Hermes regarde ce qui existe déjà chez ce fournisseur. Chaque ligne porte son
// décompte par statut, pour que « où en sont mes livraisons » tienne en UN
// appel plutôt qu'un GET par commande.
export async function GET(req: NextRequest) {
  const auth = await authentifierHermes(req);
  if (!auth.ok) return auth.response;

  try {
    const p = req.nextUrl.searchParams;

    const page = lirePagination(p);
    if ("erreur" in page) return page.erreur;

    const fournisseur = p.get("fournisseur")?.trim();
    const depuis = p.get("depuis")?.trim();

    const where: { userId: string; fournisseur?: object; date?: object } = {
      userId: auth.userId,
    };
    if (fournisseur)
      where.fournisseur = { contains: fournisseur, mode: "insensitive" };
    if (depuis) {
      const d = new Date(depuis);
      if (Number.isNaN(d.getTime()))
        return erreurHermes("« depuis » n'est pas une date lisible.");
      where.date = { gte: d };
    }

    const [total, commandes] = await Promise.all([
      prisma.commande.count({ where }),
      prisma.commande.findMany({
        where,
        orderBy: { date: "desc" },
        include: { lots: { orderBy: { createdAt: "asc" } } },
        take: page.limit,
        skip: page.offset,
      }),
    ]);

    // Un seul groupBy pour toute la page : un décompte par commande ferait
    // autant de requêtes que de lignes affichées.
    const ids = commandes.map((c) => c.id);
    const groupes = ids.length
      ? await prisma.article.groupBy({
          by: ["commandeId", "statut"],
          where: { userId: auth.userId, commandeId: { in: ids } },
          _count: { _all: true },
        })
      : [];

    const parCommande = new Map<string, Record<string, number>>();
    for (const g of groupes) {
      if (!g.commandeId) continue;
      const acc = parCommande.get(g.commandeId) ?? {};
      acc[g.statut] = g._count._all;
      parCommande.set(g.commandeId, acc);
    }

    return NextResponse.json({
      total,
      limit: page.limit,
      offset: page.offset,
      suite: page.offset + commandes.length < total,
      commandes: commandes.map((c) => ({
        ...toCommandeDTO(c),
        parStatut: parCommande.get(c.id) ?? {},
      })),
    });
  } catch (err) {
    console.error("GET /api/hermes/commandes", err);
    return erreurHermes("Erreur lors du chargement des commandes.", 500);
  }
}

/** Modes exposés à Hermes, en toutes lettres plutôt qu'en jargon de colonne. */
const MODES: Record<string, "LOT" | "PIECE"> = {
  au_lot: "LOT",
  piece_par_piece: "PIECE",
  // Le vocabulaire interne reste accepté : un appelant qui recopie la forme du
  // formulaire ne doit pas se heurter à un refus gratuit.
  LOT: "LOT",
  PIECE: "PIECE",
};

type HermesLot = {
  marque?: string;
  categorie?: string;
  /** Libellé du lot. `nom` est l'alias interne. */
  nomLot?: string;
  nom?: string;
  prefixeSku?: string;
  /** "au_lot" ou "piece_par_piece". Défaut : au lot. */
  mode?: string;
  modeSaisie?: string;
  /** Mode au lot : nombre de pièces et prix global (hors port). */
  nombrePieces?: number;
  quantite?: number;
  prixLot?: number;
  prixTotal?: number;
  /** Mode pièce par pièce : un prix par pièce. */
  prixUnitaires?: number[];
  pieces?: { prixAchat?: number }[];
};

type HermesBody = {
  fournisseur?: string;
  date?: string;
  fraisLivraison?: number;
  grade?: string | null;
  coefObjectif?: number | null;
  /** Un seul lot (le cas courant), ou plusieurs. */
  lot?: HermesLot;
  lots?: HermesLot[];
};

export async function POST(req: NextRequest) {
  const auth = await authentifierHermes(req);
  if (!auth.ok) return auth.response;

  try {
    let body: HermesBody;
    try {
      body = (await req.json()) as HermesBody;
    } catch {
      return erreurHermes("Corps de requête JSON invalide.");
    }
    if (!body || typeof body !== "object")
      return erreurHermes("Corps de requête JSON invalide.");

    const bruts = Array.isArray(body.lots)
      ? body.lots
      : body.lot
        ? [body.lot]
        : [];
    if (bruts.length === 0)
      return erreurHermes("Un lot est requis (champ `lot` ou `lots`).");

    // ── Traduction Hermes → domaine ──
    const lots: LotBody[] = [];
    for (const [i, l] of bruts.entries()) {
      const rang = i + 1;
      if (!l || typeof l !== "object")
        return erreurHermes(`Lot ${rang} invalide.`);

      const modeBrut = String(l.mode ?? l.modeSaisie ?? "au_lot").trim();
      const mode = MODES[modeBrut];
      // Refus explicite plutôt que repli silencieux sur « au lot » : un agent
      // qui écrit « piece-par-piece » créerait sinon une commande au forfait
      // sans jamais l'apprendre.
      if (!mode)
        return erreurHermes(
          `Mode invalide au lot ${rang} : « ${modeBrut} ». Attendu « au_lot » ou « piece_par_piece ».`,
        );

      const commun = {
        marque: l.marque,
        categorie: l.categorie,
        nom: l.nomLot ?? l.nom,
        prefixeSku: l.prefixeSku,
      };

      if (mode === "PIECE") {
        const prix = Array.isArray(l.prixUnitaires)
          ? l.prixUnitaires.map((p) => ({ prixAchat: p }))
          : Array.isArray(l.pieces)
            ? l.pieces
            : null;
        if (!prix)
          return erreurHermes(
            `Lot ${rang} en pièce par pièce : « prixUnitaires » (tableau de nombres) est requis.`,
          );
        lots.push({ ...commun, modeSaisie: "PIECE", pieces: prix });
      } else {
        const quantite = l.nombrePieces ?? l.quantite;
        const prixTotal = l.prixLot ?? l.prixTotal;
        if (quantite == null)
          return erreurHermes(`Lot ${rang} au lot : « nombrePieces » est requis.`);
        if (prixTotal == null)
          return erreurHermes(`Lot ${rang} au lot : « prixLot » est requis.`);
        lots.push({ ...commun, modeSaisie: "LOT", quantite, prixTotal });
      }
    }

    const entree: CommandeBody = {
      fournisseur: body.fournisseur,
      date: body.date,
      fraisLivraison: body.fraisLivraison,
      grade: body.grade,
      coefObjectif: body.coefObjectif,
      lots,
    };

    const res = await creerCommande(auth.userId, entree);
    if (!res.ok) return erreurHermes(res.error, res.status);

    return NextResponse.json(
      {
        commandeId: res.commande.id,
        skus: res.skus,
        commande: res.commande,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("POST /api/hermes/commandes", err);
    return erreurHermes("Erreur lors de la création de la commande.", 500);
  }
}
