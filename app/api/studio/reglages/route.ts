import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized } from "@/lib/apiAuth";
import { lireBudgetSaisi } from "@/lib/studioModeles";
import { lirePromptMaitreSaisi } from "@/lib/studioPrompts";
import { chargerPromptsStudio, lireReglages } from "@/lib/studioServeur";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/studio/reglages — les réglages du Studio : prompt maître, prompts
 * d'angle actifs (avec leur utilisation), budget par sac en euros
 * (`budgetParSacEur`, 1 par défaut) et taux (`tauxEurParUsd`, euros pour 1 $,
 * 0,86 par défaut).
 */
export async function GET() {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  return NextResponse.json(await chargerPromptsStudio(userId));
}

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * PUT /api/studio/reglages — `{ promptMaitre?, budgetParSacEur?, tauxEurParUsd? }`.
 * Au moins un champ ; un champ absent est inchangé, un champ présent est validé
 * (budget de 0,01 à 1 000 €, taux de 0,5 à 2 € pour 1 $ : 400 sinon, rien n'est
 * écrit). Les essais passés gardent le prompt de leur génération
 * (`promptUtilise`) : modifier le prompt maître ne réécrit aucune mesure. Le
 * budget et le taux ne touchent que les lancements à venir : le serveur les
 * relit à chaque génération.
 */
export async function PUT(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const body = await req.json().catch(() => null);

  const budget = lireBudgetSaisi(body);
  if ("erreur" in budget) return NextResponse.json({ error: budget.erreur, code: "corps_invalide" }, { status: 400 });

  let promptMaitre: string | undefined;
  if (estObjet(body) && body.promptMaitre !== undefined) {
    const lu = lirePromptMaitreSaisi(body);
    if (typeof lu !== "string") return NextResponse.json({ error: lu.erreur, code: "corps_invalide" }, { status: 400 });
    promptMaitre = lu;
  }

  if (promptMaitre === undefined && budget.budgetParSacEur === undefined && budget.tauxEurParUsd === undefined) {
    return NextResponse.json({ error: "Rien à enregistrer : prompt maître, budget ou taux attendu.", code: "corps_invalide" }, { status: 400 });
  }

  const champs = {
    ...(promptMaitre !== undefined ? { promptMaitre } : {}),
    ...(budget.budgetParSacEur !== undefined ? { budgetParSacEur: budget.budgetParSacEur } : {}),
    ...(budget.tauxEurParUsd !== undefined ? { tauxEurParUsd: budget.tauxEurParUsd } : {}),
  };
  await prisma.studioReglages.upsert({
    where: { userId },
    // À la création, ce qui n'est pas saisi prend les défauts de la base (1 €, 0,86).
    update: champs,
    create: { userId, ...champs },
    select: { id: true },
  });
  const r = await lireReglages(userId);
  return NextResponse.json({
    ok: true,
    modifieLe: (r.modifieLe ?? new Date()).toISOString(),
    budgetParSacEur: r.budgetParSacEur,
    tauxEurParUsd: r.tauxEurParUsd,
  });
}
