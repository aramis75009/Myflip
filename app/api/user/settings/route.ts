import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized } from "@/lib/apiAuth";
import {
  apercuSecret,
  chiffrer,
  chiffrementDisponible,
  dechiffrerOuNull,
} from "@/lib/crypto";
import { contexteTrello, reglagesBruts, resoudreReglages } from "@/lib/settings";
import { createWebhook } from "@/lib/trello";
import { origineDe } from "@/lib/hosts";
import type { UserSettingsDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

// Champs chiffrés, et le nom sous lequel le client les envoie.
//
// ⚠️ `trelloKey`, `trelloToken` et `trelloSecret` en ont été RETIRÉS le
// 15/08/2026 : l'accès Trello s'obtient par le parcours de connexion
// (/api/trello/connect), plus par saisie. Les colonnes existent toujours pour
// les connexions héritées, mais plus rien ne doit pouvoir les ÉCRIRE — un
// formulaire qui les repose contournerait tout le contrôle d'autorisation.
const SECRETS = ["openrouterKey"] as const;

/**
 * Enregistre le webhook Trello sur le board du compte, si possible.
 *
 * Renvoie un avertissement à afficher, ou `null` si tout va bien. Ne lève
 * jamais : la sauvegarde des réglages ne doit pas échouer parce que Trello est
 * indisponible.
 *
 * C'était un bouton séparé (« Connecter mon Trello »), que l'utilisateur
 * pouvait ne jamais cliquer — il se retrouvait entièrement configuré, sans
 * rien qui remonte, et sans indice de ce qui manquait.
 */
async function brancherWebhook(userId: string, origine: string): Promise<string | null> {
  const base = origine.replace(/\/$/, "");
  if (!base || base.includes("localhost")) {
    return "Réglages enregistrés. La connexion à Trello se fera depuis l'application en ligne : Trello ne sait pas appeler localhost.";
  }
  try {
    const ctx = await contexteTrello(userId);
    if (!ctx?.boardId) return null;
    const webhook = (await createWebhook(
      ctx,
      `${base}/api/webhooks/trello`,
      ctx.boardId,
    )) as { id?: string };
    if (webhook.id) {
      await prisma.userSettings.update({
        where: { userId },
        data: { trelloWebhookId: webhook.id },
      });
    }
    return null;
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    // Trello renvoie 400 « A webhook with that callback, model, and token
    // already exists » quand la connexion est déjà en place : ce n'est pas un
    // échec du point de vue de l'utilisateur.
    if (/already exists/i.test(message)) return null;
    console.error("[trello] création automatique du webhook échouée", err);
    return "Réglages enregistrés, mais Trello n'a pas pu être branché. Réessaie depuis « Enregistrer ».";
  }
}

// Champs stockés en clair (identifiants publics, préférences).
const CLAIRS = [
  "trelloBoardId",
  "trelloLabelId",
  "trelloComptabiliseLabelId",
  "modeleIA",
  "modeleChatIA",
] as const;

type Body = Partial<
  Record<(typeof SECRETS)[number] | (typeof CLAIRS)[number], string | null>
> & {
  objectifMensuel?: number | null;
  onboardingEtape?: number;
  onboardingTermine?: boolean;
};

/**
 * État d'un secret, tel que l'API le renvoie.
 *
 * Un secret déchiffré ne sort JAMAIS d'ici : seulement « est-il renseigné » et
 * ses 4 derniers caractères, assez pour que l'utilisateur reconnaisse sa clé
 * sans qu'elle puisse être reconstituée.
 */
function etatSecret(stocke: string | null | undefined) {
  const clair = dechiffrerOuNull(stocke);
  return {
    renseigne: Boolean(clair),
    apercu: clair ? apercuSecret(clair) : null,
  };
}

// GET /api/user/settings
export async function GET() {
  const userId = await getUserId();
  if (!userId) return unauthorized();

  try {
    const s = await reglagesBruts(userId);
    const resolus = await resoudreReglages(userId);

    const dto: UserSettingsDTO = {
      openrouter: etatSecret(s?.openrouterKey),
      trello: {
        connecte: resolus.trello !== null,
        source: resolus.source.trello,
        membreNom: s?.trelloMembreNom ?? null,
        boardId: s?.trelloBoardId ?? null,
        labelId: s?.trelloLabelId ?? null,
        comptabiliseLabelId: s?.trelloComptabiliseLabelId ?? null,
        webhookActif: Boolean(s?.trelloWebhookId),
      },
      modeleIA: s?.modeleIA ?? null,
      modeleChatIA: s?.modeleChatIA ?? null,
      objectifMensuel: s?.objectifMensuel ?? null,
      onboardingEtape: s?.onboardingEtape ?? 1,
      onboardingTermine: s?.onboardingTermine ?? false,
      // D'où vient la valeur réellement utilisée : du compte, ou de
      // l'application. C'est ce qui permet d'afficher « tu utilises la clé de
      // l'app » plutôt que de laisser croire que rien n'est configuré.
      source: resolus.source,
      chiffrementDisponible: chiffrementDisponible(),
    };
    return NextResponse.json(dto);
  } catch (err) {
    console.error("GET /api/user/settings", err);
    return NextResponse.json(
      { error: "Erreur lors du chargement des réglages." },
      { status: 500 },
    );
  }
}

// PUT /api/user/settings — mise à jour partielle.
//
// Convention : champ absent du corps = inchangé ; champ présent et vide = effacé.
// Sans cette distinction, un formulaire qui n'affiche pas les secrets (il ne
// peut pas) les effacerait à chaque enregistrement.
export async function PUT(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return unauthorized();

  try {
    if (!chiffrementDisponible()) {
      return NextResponse.json(
        {
          error:
            "ENCRYPTION_KEY absente ou invalide : impossible d'enregistrer un secret.",
        },
        { status: 500 },
      );
    }

    const body = (await req.json()) as Body;
    const data: Record<string, string | number | boolean | null> = {};

    for (const champ of SECRETS) {
      if (!(champ in body)) continue;
      const valeur = body[champ]?.trim() ?? "";
      data[champ] = valeur ? chiffrer(valeur) : null;
    }

    for (const champ of CLAIRS) {
      if (!(champ in body)) continue;
      const valeur = body[champ]?.trim() ?? "";
      data[champ] = valeur || null;
    }

    if ("onboardingEtape" in body) {
      const n = Number(body.onboardingEtape);
      // Borné : une étape hors plage bloquerait le parcours sur un écran vide.
      // Le parcours est passé de 4 à 3 étapes le 15/08/2026 (le webhook se
      // crée tout seul) : une valeur 4 déjà en base retombe donc sur 3.
      data.onboardingEtape = Number.isInteger(n)
        ? Math.min(Math.max(n, 1), 3)
        : 1;
    }
    if ("onboardingTermine" in body) {
      data.onboardingTermine = Boolean(body.onboardingTermine);
    }

    if ("objectifMensuel" in body) {
      const n = Number(body.objectifMensuel);
      data.objectifMensuel =
        body.objectifMensuel == null || !Number.isFinite(n) || n < 0 ? null : n;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "Rien à enregistrer." },
        { status: 400 },
      );
    }

    // `trelloBoardId` est unique : deux comptes ne peuvent pas revendiquer le
    // même board, sinon le webhook ne saurait plus à qui livrer l'événement.
    if (typeof data.trelloBoardId === "string") {
      const pris = await prisma.userSettings.findUnique({
        where: { trelloBoardId: data.trelloBoardId },
        select: { userId: true },
      });
      if (pris && pris.userId !== userId) {
        return NextResponse.json(
          { error: "Ce board Trello est déjà rattaché à un autre compte." },
          { status: 409 },
        );
      }
    }

    await prisma.userSettings.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });

    // Le board vient d'être choisi (ou changé) : Trello doit être prévenu de
    // nous prévenir. Best-effort, comme toute la synchro Trello — l'échec est
    // rapporté au client mais n'annule jamais l'enregistrement des réglages.
    const webhook =
      typeof data.trelloBoardId === "string" && data.trelloBoardId
        ? await brancherWebhook(userId, origineDe(req))
        : null;

    return NextResponse.json({ ok: true, webhook });
  } catch (err) {
    console.error("PUT /api/user/settings", err);
    return NextResponse.json(
      { error: "Erreur lors de l'enregistrement des réglages." },
      { status: 500 },
    );
  }
}
