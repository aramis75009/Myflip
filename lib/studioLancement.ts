import "server-only";
import { compilerCorrection } from "@/lib/studioAngles";
import { promptVariante } from "@/lib/studioCases";
import { StudioGenerationError, type DemandeImage, type GenerationErrorCode, type ImageGeneree } from "@/lib/studioGeneration";
import { RATIO_STUDIO, devisLancement, estimerEssai, formatUsd, type Devis, type Estimation, type ModeleImage } from "@/lib/studioModeles";

/**
 * Lancement d'une génération du Studio IA : lecture du corps, contrôle du devis
 * et orchestration d'UNE génération (un modèle d'un lancement).
 *
 * Écart assumé n° 5 du plan : l'écran envoie une requête par modèle coché, en
 * parallèle, et chacune porte la liste COMPLÈTE des modèles. Le serveur
 * recalcule donc le devis sur tout le lancement et refuse, avant le moindre
 * appel payant, si le seuil exige une confirmation absente. C'est ici que la
 * règle du seuil est tenue côté serveur : un appel direct à la route ne la
 * contourne pas.
 *
 * Tout ce qui touche la base, le Blob ou OpenRouter est injecté (`DepsGeneration`),
 * la route câble les vrais : le module se teste sans `vi.mock`.
 *
 * Une image générée ne sort jamais d'ici vers le navigateur : elle part au Blob,
 * la réponse ne porte que l'essai (id, numéro, modèle, coûts).
 */

export const MAX_MODELES_PAR_LANCEMENT = 6;
/** Cases d'un même lancement : une fiche compte au plus 15 photos × quelques angles. */
export const MAX_CASES_PAR_LANCEMENT = 60;

export type CorpsGeneration = {
  cle: string;
  angleId: string;
  /** La vraie photo de la ligne : la case est (referenceId, angleId). */
  referenceId: string;
  /** Le sac dont l'annonce recevra l'image une fois validée. */
  skuCible: string | null;
  /** Nombre de cases du lancement (une requête par case) : le devis porte sur toutes. */
  nbCases: number;
  /** Le modèle que CETTE requête génère. */
  modele: string;
  /** Tous les modèles cochés du lancement : c'est sur eux que porte le devis. */
  modeles: string[];
  lancementId: string;
  confirme: boolean;
  /** Correction par régénération : l'essai raté (même modèle exigé). */
  essaiParentId?: string | null;
  detailsCorrection?: string[];
};

export type ContexteGeneration = {
  colorisId: string;
  angleId: string;
  referenceId: string;
  /** Prompt maître du compte (vide s'il n'est pas saisi). */
  promptMaitre: string;
  /** Texte du prompt d'angle. */
  angleTexte: string;
  /** La vraie photo de la ligne, en data URL (vide si illisible au Blob). */
  references: string[];
  /** Faux si la case est déjà prise (validée, à juger, en vente) : seule une correction y génère. */
  caseLibre: boolean;
  /** L'essai à corriger ; `image` null = image purgée. */
  parent: { id: string; modele: string; image: string | null } | null;
};

/** Colonnes de `StudioEssai` écrites par une génération ; le numéro est attribué par l'appelant. */
export type NouvelEssai = {
  colorisId: string;
  angleId: string;
  referenceId: string;
  skuCible: string | null;
  modele: string;
  source: "api";
  promptUtilise: string;
  urlImage: string;
  coutEstimeUsd: number | null;
  coutReelUsd: number | null;
  lancementId: string;
  essaiParentId: string | null;
};

/** Colonnes de `StudioEchec`. `code` : un `GenerationErrorCode`, ou « stockage ». */
export type NouvelEchec = {
  userId: string;
  colorisId: string;
  angleId: string;
  referenceId: string;
  modele: string;
  code: string;
  message: string;
  lancementId: string;
  coutReelUsd: number | null;
};

export type DepsGeneration = {
  /** null si le coloris, l'angle ou l'essai parent n'est pas à ce compte. */
  chargerContexte(userId: string, c: CorpsGeneration): Promise<ContexteGeneration | null>;
  catalogue(id: string): Promise<ModeleImage | null>;
  /** Lève `StudioGenerationError("missing_key")` sans clé propre au compte. */
  cle(userId: string): Promise<string>;
  generer(d: DemandeImage, apiKey: string): Promise<ImageGeneree>;
  /** Range l'image au Blob, rend son URL. */
  deposer(userId: string, img: ImageGeneree): Promise<string>;
  creerEssai(data: NouvelEssai): Promise<{ id: string; numero: number }>;
  rejeterParent(essaiId: string): Promise<void>;
  creerEchec(data: NouvelEchec): Promise<void>;
};

type Reponse = { status: number; body: Record<string, unknown> };

// ── Lecture du corps ────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LONGUEUR_MAX_ID = 200;
const MAX_DETAILS_CORRECTION = 40;
const LONGUEUR_MAX_DETAIL = 500;

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Une chaîne non vide (après trim) et de longueur raisonnable, ou null. */
function identifiant(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s !== "" && s.length <= LONGUEUR_MAX_ID ? s : null;
}

/**
 * Le corps de `POST /api/studio/generations`, validé. `confirme` ne vaut vrai
 * que pour `true` exactement : dans le doute, on redemande. Une correction est
 * un lancement à un seul modèle (`modeles` = `[modele]`) : son devis est le sien.
 */
export function lireCorpsGeneration(body: unknown): CorpsGeneration | { erreur: string } {
  if (!estObjet(body)) return { erreur: "Corps illisible." };

  const cle = identifiant(body.cle);
  const angleId = identifiant(body.angleId);
  const referenceId = identifiant(body.referenceId);
  const modele = identifiant(body.modele);
  if (!cle || !angleId || !referenceId || !modele) return { erreur: "Coloris, photo, angle et modèle requis." };

  let skuCible: string | null = null;
  if (body.skuCible !== undefined && body.skuCible !== null) {
    skuCible = identifiant(body.skuCible)?.toUpperCase() ?? null;
    if (!skuCible) return { erreur: "Sac cible illisible." };
  }

  const nbCases = body.nbCases === undefined ? 1 : body.nbCases;
  if (typeof nbCases !== "number" || !Number.isInteger(nbCases) || nbCases < 1 || nbCases > MAX_CASES_PAR_LANCEMENT) {
    return { erreur: `De 1 à ${MAX_CASES_PAR_LANCEMENT} cases par lancement.` };
  }

  if (!Array.isArray(body.modeles) || body.modeles.length === 0) return { erreur: "Aucun modèle coché." };
  if (body.modeles.length > MAX_MODELES_PAR_LANCEMENT) {
    return { erreur: `${MAX_MODELES_PAR_LANCEMENT} modèles au plus par lancement.` };
  }
  const modeles: string[] = [];
  for (const m of body.modeles) {
    const id = identifiant(m);
    if (!id) return { erreur: "Modèle illisible dans la liste du lancement." };
    if (modeles.includes(id)) return { erreur: `Modèle en double dans le lancement : ${id}.` };
    modeles.push(id);
  }
  if (!modeles.includes(modele)) return { erreur: "Le modèle demandé ne fait pas partie du lancement." };

  if (typeof body.lancementId !== "string" || !UUID_RE.test(body.lancementId)) {
    return { erreur: "Identifiant de lancement invalide." };
  }
  const lancementId = body.lancementId.toLowerCase();
  const confirme = body.confirme === true;

  let essaiParentId: string | null = null;
  if (body.essaiParentId !== undefined && body.essaiParentId !== null) {
    essaiParentId = identifiant(body.essaiParentId);
    if (!essaiParentId) return { erreur: "Essai à corriger illisible." };
  }

  let detailsCorrection: string[] = [];
  if (essaiParentId) {
    if (modeles.length !== 1) return { erreur: "Une correction se lance sur un seul modèle, celui de l'essai." };
    const d = body.detailsCorrection ?? [];
    if (
      !Array.isArray(d) ||
      d.length > MAX_DETAILS_CORRECTION ||
      !d.every((x): x is string => typeof x === "string" && x.length <= LONGUEUR_MAX_DETAIL)
    ) {
      return { erreur: "Détails à corriger illisibles." };
    }
    detailsCorrection = d;
  }

  if (essaiParentId && nbCases !== 1) return { erreur: "Une correction porte sur une seule case." };

  return { cle, angleId, referenceId, skuCible, nbCases, modele, modeles, lancementId, confirme, essaiParentId, detailsCorrection };
}

// ── Références ──────────────────────────────────────────────────────────────

/** Places pour de vraies photos : le maximum du modèle, moins une pour l'image ratée d'une correction. */
function placesPourPhotos(maxReferences: number, avecImageRatee: boolean): number {
  const max = Number.isFinite(maxReferences) ? Math.floor(maxReferences) : 0;
  return Math.max(0, max - (avecImageRatee ? 1 : 0));
}

/**
 * Les vraies photos qui partent, tronquées au maximum du modèle (dans l'ordre :
 * les premières sont les mieux cadrées). L'image ratée d'une correction n'est
 * PAS dans `envoyees` : l'appelant la met en tête, elle prend une place.
 */
export function referencesAEnvoyer(
  refs: string[],
  maxReferences: number,
  avecImageRatee: boolean,
): { envoyees: string[]; tronquees: number } {
  const envoyees = refs.slice(0, placesPourPhotos(maxReferences, avecImageRatee));
  return { envoyees, tronquees: refs.length - envoyees.length };
}

/** Nombre d'images d'entrée réellement envoyées à ce modèle (image ratée comprise) : la base du devis. */
function imagesEnvoyees(m: ModeleImage, nbPhotos: number, avecImageRatee: boolean): { photos: number; total: number } {
  const photos = Math.min(Math.max(0, nbPhotos), placesPourPhotos(m.maxReferences, avecImageRatee));
  return { photos, total: photos + (avecImageRatee ? 1 : 0) };
}

// ── Contrôle du lancement ───────────────────────────────────────────────────

export type ControleLancement =
  | { ok: true; devis: Devis }
  | {
      ok: false;
      status: 400 | 409;
      code: "modele_inconnu" | "confirmation_requise" | "sans_reference";
      devis?: Devis;
      message: string;
    };

function phraseDevis(d: Devis): string {
  const s = d.inconnus > 1 ? "s" : "";
  const inconnus = `${d.inconnus} tarif${s} inconnu${s}`;
  if (d.inconnus > 0 && d.totalConnuUsd === 0) return `Ce lancement compte ${inconnus} : confirmation requise.`;
  const plus = d.inconnus > 0 ? `, plus ${inconnus}` : "";
  return `Ce lancement est estimé à ${formatUsd(d.totalConnuUsd)}${plus} : confirmation requise.`;
}

/**
 * Contrôle d'un lancement AVANT tout appel payant. `nbReferences` : les vraies
 * photos disponibles ; `avecImageRatee` : une correction, dont l'image ratée
 * s'ajoute en entrée. Le devis compte, par modèle, les entrées réellement
 * envoyées (après troncature) : c'est ce qui sera facturé.
 */
export function controlerLancement(p: {
  modeles: (ModeleImage | null)[];
  nbReferences: number;
  confirme: boolean;
  avecImageRatee?: boolean;
  /** Cases du lancement : chaque modèle génère une image par case. Défaut 1. */
  nbCases?: number;
}): ControleLancement {
  const nbCases = Math.max(1, Math.floor(p.nbCases ?? 1));
  const avecImageRatee = p.avecImageRatee === true;
  if (p.modeles.length === 0 || p.modeles.some((m) => m === null)) {
    return { ok: false, status: 400, code: "modele_inconnu", message: "Modèle absent du catalogue OpenRouter." };
  }
  const modeles = p.modeles as ModeleImage[];

  if (!(p.nbReferences > 0)) {
    return {
      ok: false,
      status: 400,
      code: "sans_reference",
      message: "Photo de la ligne illisible : réimporte-la.",
    };
  }

  const estimations: Estimation[] = [];
  for (const m of modeles) {
    const { photos, total } = imagesEnvoyees(m, p.nbReferences, avecImageRatee);
    if (photos === 0) {
      return {
        ok: false,
        status: 400,
        code: "sans_reference",
        message: `${m.nom} n'accepte qu'une image : impossible d'y joindre l'essai raté ET une vraie photo.`,
      };
    }
    if (total < m.minReferences) {
      return {
        ok: false,
        status: 400,
        code: "sans_reference",
        message: `${m.nom} exige au moins ${m.minReferences} images de référence.`,
      };
    }
    const estimation = estimerEssai(m, total);
    for (let i = 0; i < nbCases; i++) estimations.push(estimation);
  }

  const devis = devisLancement(estimations);
  if (devis.confirmationRequise && !p.confirme) {
    return { ok: false, status: 409, code: "confirmation_requise", devis, message: phraseDevis(devis) };
  }
  return { ok: true, devis };
}

// ── Prompt de correction ────────────────────────────────────────────────────

/**
 * Prompt d'une correction par régénération. Dans Gemini, le prompt de
 * correction se recolle dans la conversation ; par l'API il n'y a pas de
 * conversation, d'où la consigne d'origine reprise en fin de texte, et la phrase
 * qui dit au modèle que la PREMIÈRE image jointe est son essai précédent (elle
 * l'est : `executerGeneration` la met en tête). null s'il n'y a rien à corriger.
 */
export function promptDeCorrection(promptBase: string, details: string[]): string | null {
  const correction = compilerCorrection(details);
  if (correction === null) return null;
  const tete =
    "The first attached image is the previous attempt at this photo. The other attached images are the real reference photos of the bag. Edit the previous attempt rather than starting over.";
  const base = promptBase.trim();
  const brief = base
    ? `\n\nOriginal brief of the previous attempt, for context (the reference photos it mentions are the images after the first one):\n${base}`
    : "";
  return `${tete}\n\n${correction}${brief}`;
}

// ── Orchestration ───────────────────────────────────────────────────────────

/** 400 : à corriger par l'utilisateur (compte, réglages, contenu). Le reste : 502. */
const CODES_400: ReadonlySet<GenerationErrorCode> = new Set(["missing_key", "bad_key", "no_credits", "parametres", "securite"]);
const statutErreur = (code: GenerationErrorCode) => (CODES_400.has(code) ? 400 : 502);

const LONGUEUR_MAX_MESSAGE = 1000;

const refus = (status: number, error: string, code: string, extra: Record<string, unknown> = {}): Reponse => ({
  status,
  body: { error, code, ...extra },
});

/**
 * Une génération : un modèle d'un lancement. Ordre, et pourquoi :
 *  1. contexte (coloris, angle, photos, parent) scopé par compte — sinon 404 ;
 *  2. cohérence d'une correction (même modèle, détails, image encore là) ;
 *  3. catalogue pour TOUTE la liste, puis `controlerLancement` : un refus sort
 *     ici, sans aucun appel à `cle`, `generer` ni `deposer` ;
 *  4. le parent passe « rejeté » (corriger, c'est constater l'échec) ;
 *  5. clé du compte, génération, dépôt au Blob, essai.
 * Un échec typé de génération devient une ligne `StudioEchec` (avec le coût
 * facturé quand OpenRouter l'a dit), jamais un essai : il ne consomme pas de
 * numéro et n'entre pas dans les taux.
 */
export async function executerGeneration(deps: DepsGeneration, userId: string, c: CorpsGeneration): Promise<Reponse> {
  const ctx = await deps.chargerContexte(userId, c);
  if (!ctx) return refus(404, "Coloris, photo, angle ou essai introuvable.", "introuvable");
  // Une case prise (validée, à juger, en vente) ne se régénère que par correction.
  if (!c.essaiParentId && !ctx.caseLibre) {
    return refus(409, "Cette case a déjà servi pour ce coloris : choisis une autre variante.", "case_prise");
  }
  const promptBase = promptVariante(ctx.promptMaitre, ctx.angleTexte);

  const parent = c.essaiParentId ? ctx.parent : null;
  let promptCorrection: string | null = null;
  if (c.essaiParentId) {
    if (!parent) return refus(404, "Essai à corriger introuvable.", "introuvable");
    if (parent.modele !== c.modele) {
      return refus(400, "Une correction se régénère avec le modèle de l'essai raté.", "modele_parent");
    }
    if (!parent.image) return refus(409, "L'image de cet essai a été purgée : impossible de la corriger.", "image_purgee");
    promptCorrection = promptDeCorrection(promptBase, c.detailsCorrection ?? []);
    if (promptCorrection === null) return refus(400, "Choisis au moins un détail à corriger.", "sans_detail");
  }

  const modeles = await Promise.all(c.modeles.map((id) => deps.catalogue(id)));
  const controle = controlerLancement({
    modeles,
    nbReferences: ctx.references.length,
    confirme: c.confirme,
    avecImageRatee: parent !== null,
    nbCases: c.nbCases,
  });
  if (!controle.ok) {
    if (controle.code === "modele_inconnu") {
      const absents = c.modeles.filter((_, i) => modeles[i] === null);
      return refus(400, `Modèle absent du catalogue OpenRouter : ${absents.join(", ")}.`, "modele_inconnu");
    }
    return refus(controle.status, controle.message, controle.code, controle.devis ? { devis: controle.devis } : {});
  }

  const index = c.modeles.indexOf(c.modele);
  const modele = modeles[index] as ModeleImage;
  // Les lignes du devis vont par modèle, `nbCases` fois chacune : la première du modèle suffit.
  const estimation = controle.devis.lignes[index * c.nbCases];
  const { envoyees, tronquees } = referencesAEnvoyer(ctx.references, modele.maxReferences, parent !== null);
  const promptUtilise = promptCorrection ?? promptBase;

  if (parent) await deps.rejeterParent(parent.id);

  const echec = async (code: string, message: string, coutReelUsd: number | null) => {
    try {
      await deps.creerEchec({
        userId,
        colorisId: ctx.colorisId,
        angleId: ctx.angleId,
        referenceId: ctx.referenceId,
        modele: c.modele,
        code,
        message: message.slice(0, LONGUEUR_MAX_MESSAGE),
        lancementId: c.lancementId,
        coutReelUsd,
      });
    } catch (e) {
      // La réponse utile est l'erreur de génération : une ligne d'échec perdue ne la masque pas.
      console.error(`[studio] échec non enregistré — modèle=${c.modele} code=${code} : ${e instanceof Error ? e.name : "erreur"}`);
    }
  };

  let apiKey: string;
  try {
    apiKey = await deps.cle(userId);
  } catch (e) {
    // Pas de clé : rien n'a été tenté, donc pas de ligne d'échec. Toute autre
    // erreur (réglages illisibles) remonte telle quelle : c'est un 500.
    if (e instanceof StudioGenerationError) return refus(statutErreur(e.code), e.message, e.code);
    throw e;
  }

  let img: ImageGeneree;
  try {
    img = await deps.generer(
      {
        modele: c.modele,
        prompt: promptUtilise,
        references: parent?.image ? [parent.image, ...envoyees] : envoyees,
        ratio: modele.ratios?.includes(RATIO_STUDIO) ? RATIO_STUDIO : null,
      },
      apiKey,
    );
  } catch (e) {
    if (!(e instanceof StudioGenerationError)) throw e;
    await echec(e.code, e.message, e.coutUsd);
    return refus(statutErreur(e.code), e.message, e.code);
  }

  let urlImage: string;
  try {
    urlImage = await deps.deposer(userId, img);
  } catch (e) {
    // L'image est PAYÉE mais perdue : son coût doit quand même entrer au bilan.
    console.error(`[studio] dépôt de l'image générée impossible — modèle=${c.modele} : ${e instanceof Error ? e.name : "erreur"}`);
    const message = "Image générée mais impossible à ranger : réessaie plus tard.";
    await echec("stockage", message, img.coutUsd);
    return refus(502, message, "stockage");
  }

  const essai = await deps.creerEssai({
    colorisId: ctx.colorisId,
    angleId: ctx.angleId,
    referenceId: ctx.referenceId,
    skuCible: c.skuCible,
    modele: c.modele,
    source: "api",
    promptUtilise,
    urlImage,
    coutEstimeUsd: estimation.usd,
    coutReelUsd: img.coutUsd,
    lancementId: c.lancementId,
    essaiParentId: parent?.id ?? null,
  });

  return {
    status: 200,
    body: {
      essai: { id: essai.id, numero: essai.numero, modele: c.modele, coutEstimeUsd: estimation.usd, coutReelUsd: img.coutUsd },
      referencesEnvoyees: envoyees.length,
      referencesTronquees: tronquees,
    },
  };
}
