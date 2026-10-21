/**
 * Display formatters shared by every screen (pure, isomorphic, neutral:
 * the Studio and the sale screens may both import this file).
 *
 * Money and numbers follow fr-FR: non-breaking space before "€", a real
 * minus sign (U+2212) for negative amounts.
 */
export { coefLabel } from "./calc";
export { aujourdhuiParis, jourParis } from "./dateMiseEnVente";

const EUROS = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const EUROS_SIGNES = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  signDisplay: "exceptZero",
});
const NOMBRE = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const PLURIEL = new Intl.PluralRules("fr-FR");
const DATE_COURTE = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Paris",
});

const vraiMoins = (s: string) => s.replace(/-/g, "−");

/** 1234.5 → "1 234,50 €" */
export function eur(n: number): string {
  return vraiMoins(EUROS.format(n));
}

/** -19.45 → "−19,45 €" ; 12 → "+12,00 €" ; 0 → "0,00 €" */
export function signedEur(n: number): string {
  return vraiMoins(EUROS_SIGNES.format(n));
}

/** Tone of a signed amount: never conveyed by colour alone (always with its sign). */
export function ton(n: number): "pos" | "neg" | "neutre" {
  if (n > 0) return "pos";
  if (n < 0) return "neg";
  return "neutre";
}

/** French plural: 0, 1 and 1.5 are singular. pluriel(2, "vendu", "vendus") → "2 vendus" */
export function pluriel(n: number, singulier: string, plurielForme: string): string {
  const forme = PLURIEL.select(n) === "one" ? singulier : plurielForme;
  return `${vraiMoins(NOMBRE.format(n))} ${forme}`;
}

/** Margin coefficient level (target 2.3). */
export function niveauCoef(n: number | null): { ton: "pos" | "warn" | "neg" | "neutre"; libelle: string } {
  if (n === null || !Number.isFinite(n)) return { ton: "neutre", libelle: "—" };
  if (n >= 2.3) return { ton: "pos", libelle: "objectif tenu" };
  if (n >= 2) return { ton: "warn", libelle: "proche" };
  return { ton: "neg", libelle: "faible" };
}

/** Paris day, "03/10/2026". */
export function dateCourte(d: Date | string): string {
  return DATE_COURTE.format(typeof d === "string" ? new Date(d) : d);
}

/** "samedi 3 octobre" → "Samedi 3 octobre" */
export function majusculeInitiale(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
