// La vue « chez toi » de l'accueil /studio : les sacs que tu as en main, chacun
// avec ce qu'il lui manque, rangés par Commande (le numéro vient de FLIPO).
//
// PUR et isomorphe : ni base, ni réseau. Le serveur (lib/studioServeur.ts) lit
// ce qu'il faut (photos du coloris, images validées, statuts) et passe les
// valeurs ici ; l'écran compte et regroupe avec les mêmes fonctions. Les règles
// sont donc testées sans base.

import { pluriel } from "@/lib/format";
import { estChezToi, type SacCatalogue } from "@/lib/studioCases";

// ── État d'un sac ───────────────────────────────────────────────────────────

/** Ce qu'il manque à un sac chez toi, dans l'ordre du travail. */
export const ETATS_SAC = ["a_photographier", "a_generer", "pret"] as const;
export type EtatSac = (typeof ETATS_SAC)[number];
export const estEtatSac = (v: unknown): v is EtatSac => ETATS_SAC.includes(v as EtatSac);

/** Le mot de la pastille d'un sac. */
export const LIBELLES_ETAT: Readonly<Record<EtatSac, string>> = {
  a_photographier: "À prendre en photo",
  a_generer: "À générer",
  pret: "Prêt",
};

/**
 * L'état d'un sac, d'après deux faits :
 * - `photosDuColoris` : les vraies photos du coloris du sac (`CarteColoris.photos`,
 *   tableau ou non) ;
 * - `aImageValidee` : ce SKU a au moins une image validée, au sens de
 *   `whereImagesValidees` (lib/studioAnnonce.ts), la règle de GET /api/studio/annonce.
 *
 * « Prêt » passe en premier : si l'annonce reçoit déjà une image du SKU, il est
 * prêt, quoi qu'on compte comme photos sur la carte (un SKU qui a changé de
 * coloris garde ses images validées). Sinon, un coloris sans aucune vraie photo
 * veut une prise de vue (« à prendre en photo »), un coloris photographié veut
 * des images (« à générer »).
 */
export function etatSac(photosDuColoris: number, aImageValidee: boolean): EtatSac {
  if (aImageValidee) return "pret";
  return photosDuColoris === 0 ? "a_photographier" : "a_generer";
}

// ── Les sacs chez toi ───────────────────────────────────────────────────────

export type SacChezToi = {
  sku: string;
  /** Clé du coloris : la fiche est /studio/<cle>. Celle du Studio, alias appliqué (SDN60 → 5880-black-gold). */
  cle: string;
  modele: string;
  coloris: string;
  /** « V1 », « V2 », « V3 », ou null. */
  generation: string | null;
  /** Vignette du coloris (/api/studio/vignette), null sans image. */
  vignette: string | null;
  /** Numéro de Commande donné par FLIPO ; null s'il ne le donne pas. */
  commande: number | null;
  etat: EtatSac;
};

/** Ce que la vue lit d'un coloris du catalogue : sa clé et ses sacs (`SacbaseColoris` convient). */
export type ColorisDuCatalogue = { cle: string; sacs: readonly (SacCatalogue & { commande?: number | null })[] };

/** Ce que la vue lit d'une carte de l'accueil (`CarteColoris` convient). */
export type CarteDuSac = { cle: string; modele: string; coloris: string; generation: string | null; vignette: string | null; photos: number };

/**
 * Les sacs chez toi du catalogue, un par SKU, avec leur état. « Chez toi » est
 * la règle du Studio, `estChezToi` : statut En stock ou Photos prêtes, non
 * vendu ; le statut MyFlip (`statutDe`) l'emporte sur celui de SacBase.
 *
 * `catalogue` est celui que le Studio voit : l'alias a déjà fusionné 5883 dans
 * 5880, donc un sac de 5883 sort sous la clé 5880 et prend les photos de la carte 5880.
 */
export function sacsChezToi(
  catalogue: readonly ColorisDuCatalogue[],
  cartes: readonly CarteDuSac[],
  skusValides: ReadonlySet<string>,
  statutDe: (sku: string) => string | null,
): SacChezToi[] {
  const parCle = new Map(cartes.map((c) => [c.cle, c]));
  const sortie: SacChezToi[] = [];
  for (const coloris of catalogue) {
    const carte = parCle.get(coloris.cle);
    if (!carte) continue; // tout coloris du catalogue a sa carte ; un oubli ne doit pas casser la page
    for (const sac of coloris.sacs) {
      if (!estChezToi(sac, statutDe)) continue;
      sortie.push({
        sku: sac.sku,
        cle: coloris.cle,
        modele: carte.modele,
        coloris: carte.coloris,
        generation: carte.generation,
        vignette: carte.vignette,
        commande: sac.commande ?? null,
        etat: etatSac(carte.photos, skusValides.has(sac.sku)),
      });
    }
  }
  return sortie;
}

// ── Compteurs ───────────────────────────────────────────────────────────────

export type CompteEtats = Record<EtatSac, number> & { total: number };

/** Le nombre de sacs dans chaque état, et le total. */
export function compterEtats(sacs: readonly { etat: EtatSac }[]): CompteEtats {
  const c: CompteEtats = { a_photographier: 0, a_generer: 0, pret: 0, total: sacs.length };
  for (const s of sacs) c[s.etat]++;
  return c;
}

/**
 * « 10 sacs chez toi · 4 à prendre en photo, 5 à générer, 1 prêt » : seules les
 * parties non nulles, « sac » et « prêt » au singulier à 1 (et à 0, comme le français).
 */
export function resumeEtats(c: CompteEtats): string {
  const parties = [
    c.a_photographier > 0 ? `${c.a_photographier} à prendre en photo` : null,
    c.a_generer > 0 ? `${c.a_generer} à générer` : null,
    c.pret > 0 ? pluriel(c.pret, "prêt", "prêts") : null,
  ].filter((p): p is string => p !== null);
  return [pluriel(c.total, "sac chez toi", "sacs chez toi"), ...(parties.length > 0 ? [parties.join(", ")] : [])].join(" · ");
}

// ── Rangement par Commande ──────────────────────────────────────────────────

export type GroupeCommande = {
  /** Stable, pour les clés React et les ancres. */
  id: string;
  /** « Commande 7 », « Commande inconnue », ou « Chez toi » quand aucun sac n'a de numéro. */
  titre: string;
  commande: number | null;
  /** Le résumé de TOUT le groupe, que le filtre d'état soit actif ou non. */
  resume: string;
  /** Les sacs à montrer : ceux de l'état demandé, à prendre en photo d'abord, puis à générer, puis prêts. */
  sacs: SacChezToi[];
};

const RANG_ETAT: Readonly<Record<EtatSac, number>> = { a_photographier: 0, a_generer: 1, pret: 2 };
const parSku = (a: { sku: string }, b: { sku: string }) => a.sku.localeCompare(b.sku, "fr", { numeric: true });

/**
 * Les sacs rangés par Commande, la plus récente (le plus grand numéro) d'abord.
 *
 * - Un sac sans numéro de Commande va dans un groupe à part, en dernier. Si AUCUN
 *   sac n'a de numéro (FLIPO d'avant ce champ), c'est le seul groupe et il s'appelle
 *   « Chez toi », sans numéro ; sinon il s'appelle « Commande inconnue ».
 * - Dans un groupe : à prendre en photo, puis à générer, puis prêts, chacun par SKU.
 * - `etat` ne garde que les sacs de cet état dans chaque groupe (un groupe sans
 *   sac visible disparaît) ; le résumé reste celui du groupe entier.
 */
export function grouperParCommande(sacs: readonly SacChezToi[], etat: EtatSac | null = null): GroupeCommande[] {
  const parCommande = new Map<number | null, SacChezToi[]>();
  for (const s of sacs) parCommande.set(s.commande, [...(parCommande.get(s.commande) ?? []), s]);

  const numeros = [...parCommande.keys()].filter((k): k is number => k !== null).sort((a, b) => b - a);
  const cles: (number | null)[] = parCommande.has(null) ? [...numeros, null] : numeros;

  return cles.flatMap((commande) => {
    const tous = parCommande.get(commande)!;
    const visibles = tous
      .filter((s) => etat === null || s.etat === etat)
      .sort((a, b) => RANG_ETAT[a.etat] - RANG_ETAT[b.etat] || parSku(a, b));
    if (visibles.length === 0) return [];
    const id = commande !== null ? `commande-${commande}` : numeros.length > 0 ? "commande-inconnue" : "chez-toi";
    const titre = commande !== null ? `Commande ${commande}` : numeros.length > 0 ? "Commande inconnue" : "Chez toi";
    return [{ id, titre, commande, resume: resumeEtats(compterEtats(tous)), sacs: visibles }];
  });
}
