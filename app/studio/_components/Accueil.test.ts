import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { SacChezToi } from "@/lib/studioChezToi";
import type { CarteColoris, DonneesGrille } from "@/lib/studioServeur";

import { FILTRES_VIDES, type FiltresCatalogue } from "../_parcours";
import Accueil from "./Accueil";

// Rendu serveur de l'accueil (renderToStaticMarkup) : /studio demande une
// connexion, on contrôle donc l'affichage en rendant le composant avec des
// données fabriquées. Les effets (URL, sessionStorage) ne tournent pas ici.

const sac = (sku: string, commande: number | null, etat: SacChezToi["etat"], x: Partial<SacChezToi> = {}): SacChezToi => ({
  sku,
  cle: "5039-black-pink",
  modele: "5039",
  coloris: "Black Pink",
  generation: "V3",
  vignette: "/api/studio/vignette?cle=5039-black-pink",
  commande,
  etat,
  ...x,
});

const carte = (cle: string, photos: number, chezMoi: number | null = 1): CarteColoris => ({
  cle,
  modele: cle.split("-")[0],
  coloris: cle,
  generation: "V1",
  vignette: null,
  chezMoi,
  vendus: 0,
  nbSacs: chezMoi ?? 0,
  prises: photos,
  photos,
  libres: 0,
  cases: 0,
  aJuger: 0,
  prochain: null,
});

const donnees = (x: Partial<DonneesGrille> = {}): DonneesGrille => ({
  sacbase: { kind: "live" },
  cartes: [carte("5039-black-pink", 15), carte("5040-red", 0), carte("5041-sky", 0, 0), carte("5042-pink", 0, 0)],
  sacs: [
    sac("SDN54", 7, "a_photographier", { cle: "5040-red", coloris: "Sky Blue", generation: "V3" }),
    sac("SDN56", 7, "a_photographier", { cle: "5042-pink", coloris: "Pink" }),
    sac("SDN52", 7, "a_generer", { coloris: "White Gold Label" }),
    sac("SDN61", 7, "pret", { coloris: "Orange" }),
    sac("SDN37", 5, "a_generer", { coloris: "Dark Blue", generation: "V2" }),
    sac("SDN34", 5, "pret", { coloris: "Black and White", generation: "V2" }),
  ],
  nbAngles: 4,
  orphelines: 0,
  rattachees: 0,
  ...x,
});

const rendre = (d: DonneesGrille, f: Partial<FiltresCatalogue> = {}) => renderToStaticMarkup(createElement(Accueil, { donnees: d, filtresInitiaux: { ...FILTRES_VIDES, ...f } }));
const texte = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const position = (html: string, sous: string) => {
  const i = html.indexOf(sous);
  expect(i, `« ${sous} » absent`).toBeGreaterThanOrEqual(0);
  return i;
};

describe("accueil /studio : la vue chez toi", () => {
  const html = rendre(donnees());
  const t = texte(html);

  it("en tête, « N sacs chez toi » et les trois tuiles avec leur nombre", () => {
    expect(t).toContain("6 sacs chez toi");
    expect(t).toMatch(/2 À prendre en photo Coloris sans vraie photo\./);
    expect(t).toMatch(/2 À générer Le coloris a ses photos/);
    expect(t).toMatch(/2 Prêts Images validées/);
  });

  it("seule la tuile « à prendre en photo » a le ton d'avertissement", () => {
    // Les tuiles sont des <button> ; la pastille de chaque ligne (un <span>) porte aussi le ton, pas la tuile.
    expect(html.match(/<button[^>]*border-warn/g)).toHaveLength(1);
    expect(html).toMatch(/<button[^>]*border-warn[^>]*><span[^>]*>2<\/span><span[^>]*>À prendre en photo/);
  });

  it("les tuiles sont des boutons qui se coupent en deux colonnes sur téléphone", () => {
    expect(html).toContain("grid-cols-2");
    expect(html.match(/<button[^>]*aria-pressed="false"[^>]*>\s*<span[^>]*>\d+<\/span><span[^>]*>(À prendre en photo|À générer|Prêts)</g)).toHaveLength(3);
  });

  it("les sacs sont rangés par Commande, la plus récente d'abord, avec le résumé", () => {
    expect(position(html, "Commande 7")).toBeLessThan(position(html, "Commande 5"));
    expect(t).toContain("Commande 7 4 sacs chez toi · 2 à prendre en photo, 1 à générer, 1 prêt");
    expect(t).toContain("Commande 5 2 sacs chez toi · 1 à générer, 1 prêt");
  });

  it("une ligne par sac : SKU, coloris, génération, état, lien vers la fiche", () => {
    expect(html.match(/data-sac="/g)).toHaveLength(6);
    expect(html).toMatch(/<a data-sac="SDN54"[^>]*href="\/studio\/5040-red"/);
    expect(t).toContain("SDN54");
    expect(t).toContain("Sky Blue V3");
    expect(t).toMatch(/SDN34 .*Black and White V2 .*Prêt/);
    expect(html).toContain('src="/api/studio/vignette?cle=5039-black-pink"');
  });

  it("dans la Commande 7 : à prendre en photo, puis à générer, puis prêt", () => {
    const ordre = ["SDN54", "SDN56", "SDN52", "SDN61"].map((sku) => position(html, `data-sac="${sku}"`));
    expect([...ordre].sort((a, b) => a - b)).toEqual(ordre);
  });
});

describe("accueil /studio : le compte du catalogue passe sous la vue chez toi", () => {
  const html = rendre(donnees());
  const t = texte(html);

  it("une ligne de texte avec ses deux nombres, après les sacs et avant les filtres", () => {
    expect(t).toContain("Catalogue : 3 coloris sans vraies photos, sur 4 2 à commander");
    expect(position(html, "Commande 5")).toBeLessThan(position(html, "Catalogue :"));
    expect(position(html, "Catalogue :")).toBeLessThan(position(html, 'aria-label="Génération"'));
  });

  it("l'ancien gros chiffre et ses deux tuiles ont disparu", () => {
    expect(t).not.toMatch(/articles? sans vraies photos/);
    expect(t).not.toContain("Chez toi : à photographier Tu as le sac");
    expect(t).not.toContain("Voir les");
  });

  it("les filtres et les cartes du catalogue restent en dessous", () => {
    expect(html).toContain('aria-label="Filtre"');
    expect(html).toContain("Rechercher un coloris");
    expect(position(html, 'aria-label="Filtre"')).toBeGreaterThan(position(html, "Catalogue :"));
    expect(html).toContain("Photographier le sac"); // une carte du catalogue
  });

  it("les deux nombres sont des boutons ; à zéro, un nombre ne bouge pas", () => {
    expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*>3<\/button>/);
    const sansCommande = rendre(donnees({ cartes: [carte("5039-black-pink", 15)] }));
    expect(sansCommande).toMatch(/<button[^>]*disabled=""[^>]*>0<\/button>/);
  });
});

describe("accueil /studio : le filtre d'état", () => {
  it("?etat=pret ne garde que les sacs prêts, le résumé reste celui de la Commande, la tuile est pressée", () => {
    const html = rendre(donnees(), { etat: "pret" });
    expect(html.match(/data-sac="/g)).toHaveLength(2);
    expect(html).toContain('data-sac="SDN61"');
    expect(html).toContain('data-sac="SDN34"');
    expect(html).not.toContain('data-sac="SDN54"');
    expect(texte(html)).toContain("Commande 7 4 sacs chez toi · 2 à prendre en photo, 1 à générer, 1 prêt");
    expect(html).toMatch(/aria-pressed="true"[^>]*>\s*<span[^>]*>2<\/span><span[^>]*>Prêts/);
  });

  it("les cartes du catalogue ne bougent pas avec l'état", () => {
    const sans = rendre(donnees());
    const avec = rendre(donnees(), { etat: "a_photographier" });
    const cartes = (h: string) => h.slice(h.indexOf('aria-label="Génération"'));
    expect(cartes(avec)).toBe(cartes(sans));
  });

  it("un état sans sac : message et retour à tous les sacs", () => {
    const d = donnees({ sacs: [sac("SDN1", 7, "a_generer")] });
    const t = texte(rendre(d, { etat: "pret" }));
    expect(t).toContain("Aucun sac « Prêt » chez toi.");
    expect(t).toContain("Voir tous les sacs");
  });
});

describe("accueil /studio : sans le numéro de Commande (FLIPO d'avant ce champ)", () => {
  const d = donnees({ sacs: donnees().sacs.map((s) => ({ ...s, commande: null })) });
  const html = rendre(d);
  const t = texte(html);

  it("les sacs forment un seul groupe « Chez toi », sans numéro", () => {
    expect(t).toContain("Chez toi 6 sacs chez toi · 2 à prendre en photo, 2 à générer, 2 prêts");
    expect(html).not.toMatch(/Commande \d/);
    expect(html.match(/data-sac="/g)).toHaveLength(6);
  });

  it("le groupe passe quand même à prendre en photo d'abord, prêts à la fin", () => {
    expect(position(html, 'data-sac="SDN54"')).toBeLessThan(position(html, 'data-sac="SDN37"'));
    expect(position(html, 'data-sac="SDN37"')).toBeLessThan(position(html, 'data-sac="SDN34"'));
  });
});

describe("accueil /studio : les cas limites", () => {
  it("SacBase injoignable : pas de vue chez toi (on ne dit pas « 0 sac »), mais le catalogue et son compte restent", () => {
    const html = rendre(donnees({ sacbase: { kind: "off", reason: "injoignable" }, sacs: [] }));
    const t = texte(html);
    expect(html).not.toContain('aria-label="Sacs chez toi"');
    expect(t).not.toMatch(/\d+ sacs? chez toi/);
    expect(html).not.toContain("data-sac=");
    expect(t).toContain("Catalogue : ");
  });

  it("catalogue connu mais aucun sac chez toi : 0 sac, tuiles à zéro, message", () => {
    const t = texte(rendre(donnees({ sacs: [] })));
    expect(t).toContain("0 sac chez toi");
    expect(t).toContain("Aucun sac chez toi pour l’instant.");
  });

  it("un seul sac : « 1 sac chez toi », « 1 prêt »", () => {
    const t = texte(rendre(donnees({ sacs: [sac("SDN9", 3, "pret")] })));
    expect(t).toContain("1 sac chez toi");
    expect(t).toContain("Commande 3 1 sac chez toi · 1 prêt");
  });

  it("sans photo sur la carte, la ligne montre le modèle à la place de la vignette", () => {
    const html = rendre(donnees({ sacs: [sac("SDN9", 3, "pret", { vignette: null })] }));
    expect(html).not.toContain("<img");
    expect(texte(html)).toContain("5039 SDN9");
  });
});
