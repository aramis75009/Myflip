import { NextRequest, NextResponse } from "next/server";
import { STATUT_EN_VENTE, whereMiseEnVenteAuto } from "@/lib/dateMiseEnVente";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized } from "@/lib/apiAuth";
import { deriveVente, euros, STATUT_VENDU, STATUTS } from "@/lib/calc";
import { resoudreReglages } from "@/lib/settings";
import {
  appelerChat,
  appelsOutils,
  construireCorpsChat,
  ErreurAssistant,
  messageAssistantBrut,
  texteAssistant,
  type MessageChat,
  type OutilChat,
} from "@/lib/openrouterChat";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const MUTATING = new Set(["update_articles_status", "mark_articles_sold"]);

// ---------- Définition des outils exposés au modèle ----------

const tools: OutilChat[] = [
  {
    type: "function",
    function: {
      name: "get_stats",
      description:
        "Récupère les indicateurs globaux : chiffre d'affaires total, marge nette totale, nombre d'articles en stock, nombre d'articles vendus et total d'articles.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_articles",
      description:
        "Récupère la liste des articles, avec filtres optionnels. 'sku' accepte un SKU exact, un préfixe (ex. 'PRL') ou une liste séparée par des virgules.",
      parameters: {
        type: "object",
        properties: {
          marque: { type: "string", description: "Nom exact de la marque" },
          statut: { type: "string", description: "Statut exact" },
          sku: { type: "string", description: "SKU exact, préfixe ou liste" },
          limit: { type: "number", description: "Nombre max d'articles (défaut 50)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "count_articles",
      description:
        "Compte les articles correspondant à un filtre (marque, statut, sku).",
      parameters: {
        type: "object",
        properties: {
          marque: { type: "string" },
          statut: { type: "string" },
          sku: { type: "string", description: "SKU exact, préfixe ou liste" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_articles_status",
      description:
        "Modifie le statut d'un ensemble d'articles. Ne pas utiliser pour le statut 'Vendu' (utiliser mark_articles_sold). Le filtre peut cibler par marque, statut actuel, sku (exact/préfixe/liste) et limiter le nombre.",
      parameters: {
        type: "object",
        properties: {
          filtre: {
            type: "object",
            properties: {
              marque: { type: "string" },
              statut_actuel: { type: "string" },
              sku: { type: "string", description: "SKU exact, préfixe ou liste" },
              limit: { type: "number", description: "Nombre max d'articles à modifier" },
            },
          },
          nouveau_statut: { type: "string", description: "Le nouveau statut" },
        },
        required: ["filtre", "nouveau_statut"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mark_articles_sold",
      description:
        "Marque des articles comme vendus avec un prix de vente et une date de vente (format ISO ou YYYY-MM-DD). Le filtre cible par marque, sku (exact/préfixe/liste) et limit.",
      parameters: {
        type: "object",
        properties: {
          filtre: {
            type: "object",
            properties: {
              marque: { type: "string" },
              sku: { type: "string", description: "SKU exact, préfixe ou liste" },
              limit: { type: "number" },
            },
          },
          prixVente: { type: "number" },
          dateVente: { type: "string", description: "Date ISO ou YYYY-MM-DD" },
        },
        required: ["prixVente", "dateVente"],
      },
    },
  },
];

const SYSTEM = `Tu es l'assistant IA de "MyFlip", une application de gestion de stock pour un revendeur de vêtements de marque.
Réponds TOUJOURS en français, de façon concise.

Marques : "Polo Ralph Lauren" (SKU préfixe PRL), "Lacoste" (LAC), "Tommy Hilfiger" (TH).
Les SKU ont la forme PRL-001, LAC-001, TH-001.
Statuts possibles : ${STATUTS.join(", ")}.

Règles :
- Pour répondre à une QUESTION (CA, stock, comptage, liste), appelle les outils de lecture (get_stats, get_articles, count_articles) puis donne une réponse claire avec les chiffres réels. N'invente jamais de chiffres.
- Pour une ACTION de modification (changer un statut, marquer comme vendu), commence ta réponse par un plan clair commençant par "Je vais …", puis appelle l'outil correspondant (update_articles_status ou mark_articles_sold) pour préparer l'action.
- Quand l'utilisateur cite un préfixe comme "PRL", "LAC" ou "TH", utilise le filtre sku avec ce préfixe.
- Pour "les N premiers X", utilise le filtre sku (préfixe) avec limit = N.
- Pour mettre des articles "Vendu", utilise mark_articles_sold (jamais update_articles_status).`;

// ---------- Construction des filtres Prisma ----------

function skuWhere(sku?: string): Prisma.ArticleWhereInput {
  if (!sku) return {};
  const t = sku.trim();
  if (!t) return {};
  if (t.includes(",")) {
    return {
      sku: { in: t.split(",").map((s) => s.trim()).filter(Boolean) },
    };
  }
  return { sku: { startsWith: t } };
}

// `userId` est un champ OBLIGATOIRE de la signature, et non un paramètre
// optionnel : c'est ce qui rend impossible d'oublier le cloisonnement sur l'un
// des cinq outils exposés au modèle. Un outil qui ne le passe pas ne compile pas.
function buildWhere(f: {
  userId: string;
  marque?: string;
  statut?: string;
  sku?: string;
}): Prisma.ArticleWhereInput {
  const where: Prisma.ArticleWhereInput = {
    userId: f.userId,
    ...skuWhere(f.sku),
  };
  if (f.marque) where.marque = f.marque;
  if (f.statut) where.statut = f.statut;
  return where;
}

// ---------- Outils de lecture ----------

async function runRead(
  name: string,
  input: Record<string, unknown>,
  userId: string,
) {
  if (name === "get_stats") {
    const arts = await prisma.article.findMany({
      where: { userId },
      select: { statut: true, prixVente: true, margeNette: true },
    });
    const vendus = arts.filter((a) => a.statut === STATUT_VENDU);
    const round = (n: number) => Math.round(n * 100) / 100;
    return {
      caTotal: round(vendus.reduce((s, a) => s + (a.prixVente ?? 0), 0)),
      margeNetteTotal: round(
        vendus.reduce((s, a) => s + (a.margeNette ?? 0), 0),
      ),
      enStock: arts.filter((a) => a.statut === "En stock").length,
      vendus: vendus.length,
      totalArticles: arts.length,
    };
  }

  if (name === "count_articles") {
    const where = buildWhere({
      userId,
      marque: input.marque as string | undefined,
      statut: input.statut as string | undefined,
      sku: input.sku as string | undefined,
    });
    const count = await prisma.article.count({ where });
    return { count };
  }

  if (name === "get_articles") {
    const where = buildWhere({
      userId,
      marque: input.marque as string | undefined,
      statut: input.statut as string | undefined,
      sku: input.sku as string | undefined,
    });
    const total = await prisma.article.count({ where });
    const limit = Math.min(Number(input.limit) || 50, 200);
    const articles = await prisma.article.findMany({
      where,
      orderBy: { sku: "asc" },
      take: limit,
      select: {
        sku: true,
        marque: true,
        statut: true,
        prixAchat: true,
        prixVente: true,
      },
    });
    return { total, retournes: articles.length, articles };
  }

  throw new Error(`Outil de lecture inconnu : ${name}`);
}

// ---------- Outils de mutation (exécutés après confirmation) ----------

async function runMutation(
  name: string,
  input: Record<string, unknown>,
  userId: string,
): Promise<string> {
  if (name === "update_articles_status") {
    const filtre = (input.filtre ?? {}) as {
      marque?: string;
      statut_actuel?: string;
      sku?: string;
      limit?: number;
    };
    const nouveau = String(input.nouveau_statut ?? "").trim();

    if (!STATUTS.includes(nouveau as never)) {
      return `❌ Statut invalide : « ${nouveau} ».`;
    }
    if (nouveau === STATUT_VENDU) {
      return "❌ Pour marquer des articles comme vendus, un prix de vente est requis (utilise « marquer comme vendu »).";
    }

    const where = buildWhere({
      userId,
      marque: filtre.marque,
      statut: filtre.statut_actuel,
      sku: filtre.sku,
    });

    // Champs de vente remis à null si on quitte un état vendu (règle centrale).
    const data = {
      statut: nouveau,
      prixVente: null,
      dateVente: null,
      margeBrute: null,
      margeNette: null,
      coefficient: null,
    };

    // Cible effective : le filtre, ou ses `limit` premiers articles.
    const cible =
      filtre.limit && filtre.limit > 0
        ? {
            userId,
            id: {
              in: (
                await prisma.article.findMany({
                  where,
                  orderBy: { sku: "asc" },
                  take: filtre.limit,
                  select: { id: true },
                })
              ).map((a) => a.id),
            },
          }
        : where;

    // Date de mise en vente posée AVANT le changement de statut, dans la même
    // transaction : le filtre repère les articles qui passent vraiment en
    // « En vente » à leur statut d'avant (cf. lib/dateMiseEnVente.ts).
    const resultats = await prisma.$transaction([
      ...(nouveau === STATUT_EN_VENTE
        ? [prisma.article.updateMany({ where: whereMiseEnVenteAuto(cible), data: { dateMiseEnVente: new Date() } })]
        : []),
      prisma.article.updateMany({ where: cible, data }),
    ]);
    const count = resultats[resultats.length - 1].count;

    return `✓ ${count} article(s) passés au statut « ${nouveau} ».`;
  }

  if (name === "mark_articles_sold") {
    const filtre = (input.filtre ?? {}) as {
      marque?: string;
      sku?: string;
      limit?: number;
    };
    const prixVente = Number(input.prixVente);
    if (!Number.isFinite(prixVente) || prixVente <= 0) {
      return "❌ Prix de vente invalide.";
    }
    const dateVente = input.dateVente
      ? new Date(String(input.dateVente))
      : new Date();

    const where = buildWhere({ userId, marque: filtre.marque, sku: filtre.sku });
    const articles = await prisma.article.findMany({
      where,
      orderBy: { sku: "asc" },
      take: filtre.limit && filtre.limit > 0 ? filtre.limit : undefined,
    });

    if (articles.length === 0) return "Aucun article ne correspond au filtre.";

    await prisma.$transaction(
      articles.map((a) => {
        const d = deriveVente({
          statut: STATUT_VENDU,
          prixAchat: a.prixAchat,
          prixVente,
          dateVente,
        });
        return prisma.article.update({
          where: { id: a.id },
          data: {
            statut: STATUT_VENDU,
            prixVente: d.prixVente,
            dateVente: d.dateVente,
            margeBrute: d.margeBrute,
            margeNette: d.margeNette,
            coefficient: d.coefficient,
          },
        });
      }),
    );

    return `✓ ${articles.length} article(s) marqués comme vendus à ${euros(prixVente)}.`;
  }

  return `❌ Action inconnue : ${name}.`;
}

function defaultPlan(name: string, input: Record<string, unknown>): string {
  if (name === "update_articles_status") {
    return `Je vais modifier le statut des articles correspondants vers « ${input.nouveau_statut} ».`;
  }
  if (name === "mark_articles_sold") {
    return `Je vais marquer les articles correspondants comme vendus à ${euros(Number(input.prixVente))}.`;
  }
  return "Je vais exécuter l'action demandée.";
}

// ---------- Handler ----------

type Body = {
  message?: string;
  confirmed?: boolean;
  pendingAction?: { tool: string; input: Record<string, unknown> } | null;
};

export async function POST(req: NextRequest) {
  // Le chatbot expose des outils MUTANTS au modèle (changement de statut en
  // masse, marquage vendu). Sans cette garde, ils étaient appelables sans
  // aucune session.
  const userId = await getUserId();
  if (!userId) return unauthorized();

  try {
    // Clé du compte si l'utilisateur en a saisi une, sinon celle de l'app.
    const { openrouterKey, modeleChatIA } = await resoudreReglages(userId);
    if (!openrouterKey) {
      return NextResponse.json(
        {
          error:
            "Aucune clé OpenRouter : renseigne la tienne dans Mon compte, ou configure celle de l'application.",
        },
        { status: 500 },
      );
    }

    const body = (await req.json()) as Body;

    // --- Exécution après confirmation ---
    if (body.confirmed && body.pendingAction) {
      const { tool, input } = body.pendingAction;
      if (!MUTATING.has(tool)) {
        return NextResponse.json(
          { error: "Action non autorisée." },
          { status: 400 },
        );
      }
      const result = await runMutation(tool, input ?? {}, userId);
      return NextResponse.json({ result });
    }

    const message = body.message?.trim();
    if (!message) {
      return NextResponse.json({ error: "Message vide." }, { status: 400 });
    }

    const historique: MessageChat[] = [{ role: "user", content: message }];

    let reponse = await appelerChat(
      construireCorpsChat(SYSTEM, tools, historique, modeleChatIA),
      openrouterKey,
    );

    // Boucle : on exécute les outils de LECTURE et on relance le modèle ;
    // dès qu'un outil de MUTATION apparaît, on s'arrête et on attend confirmation.
    for (let i = 0; i < 5; i++) {
      const appels = appelsOutils(reponse);
      const texte = texteAssistant(reponse);

      if (appels.length === 0) {
        return NextResponse.json({ result: texte || "…" });
      }

      const mutation = appels.find((t) => MUTATING.has(t.name));
      if (mutation) {
        return NextResponse.json({
          plan: texte || defaultPlan(mutation.name, mutation.input),
          pendingAction: { tool: mutation.name, input: mutation.input },
        });
      }

      // Tous les outils sont en lecture : on les exécute et on continue.
      historique.push(messageAssistantBrut(reponse));
      for (const appel of appels) {
        const data = await runRead(appel.name, appel.input, userId);
        historique.push({
          role: "tool",
          tool_call_id: appel.id,
          content: JSON.stringify(data),
        });
      }

      reponse = await appelerChat(
        construireCorpsChat(SYSTEM, tools, historique, modeleChatIA),
        openrouterKey,
      );
    }

    return NextResponse.json({
      result: "Je n'ai pas pu finaliser la demande, peux-tu reformuler ?",
    });
  } catch (err) {
    console.error("POST /api/chat", err);
    // Seule une `ErreurAssistant` porte un message SÛR à renvoyer tel quel
    // (clé refusée, crédits épuisés, modèle inconnu…) — cf. lib/openrouterChat.ts.
    // Toute autre erreur (Prisma, bug interne) reste générique.
    if (err instanceof ErreurAssistant) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    return NextResponse.json(
      { error: "Erreur de l'assistant IA." },
      { status: 500 },
    );
  }
}
