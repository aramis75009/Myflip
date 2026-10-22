// The model picker of the Studio, as pure logic: one row per catalogue model
// (price, cost of a full bag against the account budget, Aramis's real
// results), search, filters, sort, a 1-to-3 selection, and the words of a
// spending confirmation.
//
// PURE and ISOMORPHIC: no React, no fetch, no DOM. Tested by
// app/studio/_modeles.test.ts.
//
// Rules kept from the Studio:
//  - never an invented price: an unknown price stays « inconnu » (null), is
//    never « dans le budget » and always sorts LAST by cost;
//  - a model never used has no aggregate: « jamais essayé », never 0 %;
//  - only Aramis's decisions make a success rate (lib/studioAgregats.ts).

import type { AgregatModele } from "@/lib/studioAgregats";
import {
  coutSac,
  formatEur,
  usdEnEur,
  type BudgetCompte,
  type CoutSac,
  type DevisBudget,
  type DevisMultiModeles,
  type ModeleImage,
} from "@/lib/studioModeles";

/**
 * Models per launch: 1, or 2 to 3 to compare them on the same cells.
 * = MAX_MODELES_PAR_LANCEMENT of lib/studioLancement (server-only, so copied;
 * app/studio/_modeles.test.ts checks they stay equal).
 */
export const MAX_MODELES_LANCEMENT = 3;

/** What the picker knows about one model. */
export type LigneModele = {
  modele: ModeleImage;
  /** Cost of a full bag (15 cells, one image each) at the account budget and rate. */
  sac: CoutSac;
  /** Aramis's real results with this model; null = never used. */
  agregat: AgregatModele | null;
  favori: boolean;
  /** Why this model cannot be picked for the Studio, or null. */
  inutilisable: string | null;
};

/**
 * Each cell sends ONE real photo: a model that demands more references can
 * never run here (the server would answer 400 « sans_reference »).
 */
function raisonInutilisable(m: ModeleImage): string | null {
  if (m.minReferences > 1) return `Exige ${m.minReferences} images de référence : le Studio n’en envoie qu’une par prise.`;
  return null;
}

export function construireLignes(
  modeles: readonly ModeleImage[],
  agregats: readonly AgregatModele[],
  favoris: readonly string[],
  budget: BudgetCompte,
): LigneModele[] {
  const parModele = new Map(agregats.map((a) => [a.modele, a]));
  const fav = new Set(favoris);
  return modeles.map((m) => ({
    modele: m,
    sac: coutSac(m, budget),
    agregat: parModele.get(m.id) ?? null,
    favori: fav.has(m.id),
    inutilisable: raisonInutilisable(m),
  }));
}

// ── Search, filters, sort ───────────────────────────────────────────────────

export type FiltresModeles = {
  /** Free text, every word must appear in the name or the id (accents and case ignored). */
  q: string;
  /** Only models whose full bag fits the budget (a known price, under or at the budget). */
  dansBudget: boolean;
  /** Only models Aramis already used (an image or a failure). */
  dejaTeste: boolean;
};

export const FILTRES_VIDES: FiltresModeles = { q: "", dansBudget: false, dejaTeste: false };

const normaliser = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function filtrerLignes(lignes: readonly LigneModele[], f: FiltresModeles): LigneModele[] {
  const mots = normaliser(f.q).split(/\s+/).filter(Boolean);
  return lignes.filter((l) => {
    if (f.dansBudget && l.sac.statutBudget !== "dans") return false;
    if (f.dejaTeste && !l.agregat) return false;
    if (mots.length === 0) return true;
    const texte = normaliser(`${l.modele.nom} ${l.modele.id}`);
    return mots.every((mot) => texte.includes(mot));
  });
}

export type TriModeles = "cout" | "reussite";

/** Ascending, null LAST (an unknown price is never « the cheapest »). */
function compareNullFin(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

const parNom = (a: LigneModele, b: LigneModele) => a.modele.nom.localeCompare(b.modele.nom, "fr");

/**
 * « cout »: cost of a full bag, cheapest first, unknown prices last.
 * « reussite »: first-try success rate, best first; « jamais essayé » and
 * « pas encore jugé » last; ties broken by the number of decided first tries
 * (more evidence first), then by cost.
 */
export function trierLignes(lignes: readonly LigneModele[], tri: TriModeles): LigneModele[] {
  const copie = [...lignes];
  if (tri === "cout") return copie.sort((a, b) => compareNullFin(a.sac.eur, b.sac.eur) || parNom(a, b));
  return copie.sort((a, b) => {
    const ta = a.agregat?.tauxPremierCoup ?? null;
    const tb = b.agregat?.tauxPremierCoup ?? null;
    return (
      compareNullFin(ta === null ? null : -ta, tb === null ? null : -tb) ||
      (b.agregat?.premiersCoupsDecides ?? 0) - (a.agregat?.premiersCoupsDecides ?? 0) ||
      compareNullFin(a.sac.eur, b.sac.eur) ||
      parNom(a, b)
    );
  });
}

/** Favourites pinned first, the rest after, each in the given order. */
export function sectionsLignes(lignes: readonly LigneModele[]): { favoris: LigneModele[]; autres: LigneModele[] } {
  return { favoris: lignes.filter((l) => l.favori), autres: lignes.filter((l) => !l.favori) };
}

// ── Selection ───────────────────────────────────────────────────────────────

/**
 * Adds or removes `id`. Adding a 4th model is refused (`plein`): the
 * selection is returned unchanged, the screen says why.
 */
export function basculerSelection(
  selection: readonly string[],
  id: string,
  max: number = MAX_MODELES_LANCEMENT,
): { selection: string[]; refus: "plein" | null } {
  if (selection.includes(id)) return { selection: selection.filter((x) => x !== id), refus: null };
  if (selection.length >= max) return { selection: [...selection], refus: "plein" };
  return { selection: [...selection, id], refus: null };
}

/**
 * The remembered selection, cleaned against the catalogue: unknown ids,
 * duplicates and unusable models go, at most 3 stay. Nothing remembered →
 * the first usable favourite, so a picker never opens empty for no reason.
 */
export function selectionInitiale(memoire: unknown, lignes: readonly LigneModele[]): string[] {
  const utilisables = new Set(lignes.filter((l) => !l.inutilisable).map((l) => l.modele.id));
  if (Array.isArray(memoire)) {
    const propre = [...new Set(memoire.filter((x): x is string => typeof x === "string" && utilisables.has(x)))];
    if (propre.length > 0) return propre.slice(0, MAX_MODELES_LANCEMENT);
  }
  const favori = lignes.find((l) => l.favori && !l.inutilisable);
  return favori ? [favori.modele.id] : [];
}

// ── Words ───────────────────────────────────────────────────────────────────

export type Reussite = { texte: string; detail: string | null; connue: boolean };

/** « 78 % » (7/9 au 1er coup) | « pas encore jugé » | « jamais essayé ». Never 0 % without a decision. */
export function libelleReussite(a: AgregatModele | null): Reussite {
  if (!a) return { texte: "jamais essayé", detail: null, connue: false };
  if (a.tauxPremierCoup === null) {
    return { texte: "pas encore jugé", detail: a.images > 0 ? "aucun premier coup décidé" : null, connue: false };
  }
  return {
    texte: `${Math.round(a.tauxPremierCoup * 100)} %`,
    detail: `${a.premiersCoupsValides}/${a.premiersCoupsDecides} au 1er coup`,
    connue: true,
  };
}

/**
 * Real average cost per image, in euros, or null when no real cost is known
 * (then the screen says nothing rather than a zero). `partiel`: some images
 * have no real cost, the average covers `sur` of them.
 */
export function coutMoyenReel(a: AgregatModele | null, taux: number): { eur: number; partiel: boolean; sur: number; images: number } | null {
  if (!a || a.coutMoyenReelUsd === null) return null;
  const eur = usdEnEur(a.coutMoyenReelUsd, taux);
  if (eur === null) return null;
  return { eur, partiel: a.coutIncomplet, sur: a.coutsConnus, images: a.images };
}

const JOUR_PARIS = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });

/** Days between two instants, counted on the Paris calendar (midnight to midnight). */
function joursParis(de: Date, a: Date): number {
  const jour = (d: Date) => Date.parse(`${JOUR_PARIS.format(d)}T00:00:00Z`);
  return Math.round((jour(a) - jour(de)) / 86_400_000);
}

/** « aujourd’hui » | « hier » | « il y a 3 j » | « il y a 2 mois » | « il y a 1 an » ; null without a date. */
export function depuis(iso: string | null, maintenant: Date): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const j = Math.max(0, joursParis(new Date(t), maintenant));
  if (j === 0) return "aujourd’hui";
  if (j === 1) return "hier";
  if (j < 31) return `il y a ${j} j`;
  if (j < 365) return `il y a ${Math.floor(j / 30.44)} mois`;
  const ans = Math.floor(j / 365.25);
  return `il y a ${ans} an${ans > 1 ? "s" : ""}`;
}

/**
 * The amount a cost takes of the budget, for a gauge: 0.5 = half. null when
 * the cost or the budget is unknown. Not capped: the screen caps the bar and
 * says « 2,1 × le budget ».
 */
export function partDuBudget(eur: number | null, budgetEur: number): number | null {
  if (eur === null || !Number.isFinite(eur) || eur < 0 || !Number.isFinite(budgetEur) || budgetEur <= 0) return null;
  return eur / budgetEur;
}

/** « 2,1 × le budget » for a cost strictly over the budget, else null. */
export function depassement(eur: number | null, budgetEur: number): string | null {
  const p = partDuBudget(eur, budgetEur);
  if (p === null || p <= 1) return null;
  return `${p.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} × le budget`;
}

/**
 * Label of the confirmation button: the amount it commits to, rounded UP to
 * the cent (`montantConfirmationEur`). With an unknown price, the amount is a
 * minimum and the button says so; with no known price at all, no amount.
 */
export function libelleConfirmer(d: DevisBudget): string {
  if (d.inconnus === 0) return `Confirmer ${formatEur(d.montantConfirmationEur)}`;
  if (d.totalConnuEur > 0) return `Confirmer ${formatEur(d.montantConfirmationEur)} + prix inconnu`;
  return "Confirmer sans prix connu";
}

/** Why the launch asks first, in one sentence (the button carries the amount). */
export function phraseConfirmation(d: DevisMultiModeles): string {
  const sansPrix = d.parModele.filter((l) => l.usd === null).map((l) => l.nom);
  const noms = sansPrix.length > 0 ? sansPrix.join(", ") : null;
  const budget = `ton budget de ${formatEur(d.budgetEur)} par sac`;
  switch (d.raisonConfirmation) {
    case "budget":
      return `Ce lancement est estimé à ${formatEur(d.montantConfirmationEur)}, au-delà de ${budget}.`;
    case "prix_inconnu":
      return d.totalConnuEur > 0
        ? `Le prix de ${noms ?? "ce modèle"} n’est pas publié : le lancement coûtera plus que les ${formatEur(d.montantConfirmationEur)} connus, le reste ne se saura qu’après la génération.`
        : `Le prix de ${noms ?? "ce modèle"} n’est pas publié : le coût ne se saura qu’après la génération.`;
    case "budget_et_prix_inconnu":
      return `Ce lancement dépasse déjà ${budget} (${formatEur(d.montantConfirmationEur)} connus), et le prix de ${noms ?? "ce modèle"} n’est pas publié.`;
    default:
      return `Ce lancement est estimé à ${formatEur(d.montantConfirmationEur)}, dans ${budget}.`;
  }
}

/**
 * Short words of a launch quote: « 0,10 € », « 0,10 € + prix inconnu »,
 * « prix inconnu ». The amount is the one the confirmation button commits to
 * (rounded UP to the cent): the screen never shows two totals for one launch.
 */
export function montantCourt(d: DevisBudget): string {
  if (d.inconnus === 0) return formatEur(d.montantConfirmationEur);
  if (d.totalConnuEur > 0) return `${formatEur(d.montantConfirmationEur)} + prix inconnu`;
  return "prix inconnu";
}
