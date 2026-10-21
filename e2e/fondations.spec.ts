/**
 * Comportements nouveaux de la refonte des fondations (plan docs/refonte/plan-fondations.md,
 * lot LS). Chaque titre est préfixé par le lot qui fait passer le test.
 *
 * Version minimale du lot : la virtualisation du Stock (M1). Les autres tests du
 * plan (feuille, cloche, « Plus », fenêtre de vente unique, sélection, session
 * restaurée, calendrier mobile) restent à écrire.
 *
 * Aucune écriture : /stock est lu seulement, et la garde d'écritures est posée par
 * précaution.
 */
import type { Page } from "@playwright/test";

import { visible } from "./catalogue-routes";
import { attendreCalme } from "./outils/calme";
import { bloquerEcritures } from "./outils/ecritures";
import { expect, test } from "./outils/test";

test.use({ compte: "demo" });

/** Nombre d'articles du compte `demo` (e2e/seed/seed-e2e.ts : 88). */
const ARTICLES = 88;

/** Écart toléré entre la hauteur rendue et la hauteur virtuelle, en px (plan, lot LS). */
const TOLERANCE_PX = 2;

type Releve = {
  /** Défilement de la page à cet instant. */
  y: number;
  max: number;
  /** Hauteur du conteneur virtuel : `<tbody>` en ordinateur, `<div>` des cartes en mobile. */
  conteneur: number;
  /** Cales (éléments sans data-index) avant la première ligne rendue et après la dernière. */
  caleHaut: number;
  caleBas: number;
  /** Lignes rendues : place réelle occupée dans le flux (jusqu'à l'élément suivant, marges comprises). */
  lignes: { index: number; pas: number; hauteur: number }[];
};

/** Relève le conteneur virtuel, ses cales et les lignes rendues, dans le même instant. */
async function releve(page: Page): Promise<Releve> {
  return page.evaluate(() => {
    const premiere = document.querySelector("[data-index]");
    const conteneur = premiere?.parentElement;
    if (!premiere || !conteneur) throw new Error("Aucune ligne virtualisée rendue.");
    const enfants = [...conteneur.children];
    const bas = conteneur.getBoundingClientRect().bottom;
    const lignes = enfants.flatMap((el, i) => {
      if (!el.hasAttribute("data-index")) return [];
      const r = el.getBoundingClientRect();
      const suivant = enfants[i + 1]?.getBoundingClientRect().top ?? bas;
      return [{ index: Number(el.getAttribute("data-index")), pas: suivant - r.top, hauteur: r.height }];
    });
    const premier = enfants.findIndex((el) => el.hasAttribute("data-index"));
    const dernier = enfants.length - 1 - [...enfants].reverse().findIndex((el) => el.hasAttribute("data-index"));
    const cale = (el: Element | undefined) => (el && !el.hasAttribute("data-index") ? el.getBoundingClientRect().height : 0);
    return {
      y: window.scrollY,
      max: document.documentElement.scrollHeight - window.innerHeight,
      conteneur: conteneur.getBoundingClientRect().height,
      caleHaut: cale(enfants[premier - 1]),
      caleBas: cale(enfants[dernier + 1]),
      lignes,
    };
  });
}

/** Défile à `y`, laisse le virtualiseur monter les lignes (scroll, rendu, mesure), puis relève. */
async function releveEn(page: Page, y: number): Promise<Releve> {
  await page.evaluate((cible) => window.scrollTo({ top: cible, behavior: "instant" }), y);
  await page.evaluate(() => new Promise<void>((fin) => requestAnimationFrame(() => requestAnimationFrame(() => fin()))));
  await page.waitForTimeout(120);
  return releve(page);
}

/** Parcourt toute la page par pas de `pas` px et rend un relevé par pas, dont le dernier est tout en bas. */
async function parcourir(page: Page, pas: number): Promise<Releve[]> {
  const releves: Releve[] = [];
  let y = 0;
  for (;;) {
    const r = await releveEn(page, y);
    releves.push(r);
    if (y >= r.max) return releves;
    y = Math.min(y + pas, r.max);
  }
}

const mediane = (valeurs: number[]) => {
  const t = [...valeurs].sort((a, b) => a - b);
  return t[Math.floor(t.length / 2)];
};

test("[M1] virtualisation : hauteur totale = hauteur rendue", async ({ page, isMobile }) => {
  const garde = await bloquerEcritures(page);
  await page.goto("/stock");
  await expect(visible(page.getByText("Articles au total"))).toBeVisible();
  await expect(page.getByRole("button", { name: `Tous ${ARTICLES}` })).toBeVisible();
  await expect(page.locator("[data-index]").first()).toBeVisible();
  expect(await attendreCalme(page), "réseau jamais calme").toBe(true);

  // 1. Au chargement, en haut : aucune ligne n'a été mesurée. La cale du bas vaut
  //    (lignes non rendues) × (taille estimée) : c'est la taille que le virtualiseur suppose.
  const debut = await releveEn(page, 0);
  const dernierRendu = Math.max(...debut.lignes.map((l) => l.index));
  const nonRendues = ARTICLES - 1 - dernierRendu;
  expect(nonRendues, "il doit rester des lignes non rendues sous la fenêtre (sinon rien n'est virtualisé)").toBeGreaterThan(0);
  const estimee = debut.caleBas / nonRendues;

  // 2. Premier passage, du haut vers le bas, en couvrant tous les index.
  const premier = await parcourir(page, 300);
  const pas = new Map<number, number>();
  for (const r of premier) for (const l of r.lignes) pas.set(l.index, l.pas);
  const manquants = Array.from({ length: ARTICLES }, (_, i) => i).filter((i) => !pas.has(i));
  expect(manquants, "index jamais rendus pendant le parcours").toEqual([]);

  // 3. Second passage : toutes les lignes sont connues du virtualiseur (mesurées en mobile).
  const second = await parcourir(page, 300);
  for (const r of second) for (const l of r.lignes) pas.set(l.index, l.pas);
  const somme = [...pas.values()].reduce((s, p) => s + p, 0);
  const bas = second[second.length - 1];

  // Ce que la page a vraiment dans le flux : la somme des places des lignes, tout en bas.
  const typique = mediane([...pas.values()]);
  const mesure = {
    projet: isMobile ? "mobile" : "desktop",
    tailleEstimeeParLeVirtualiseur: Math.round(estimee * 100) / 100,
    placeTypiqueReelle: Math.round(typique * 100) / 100,
    sommeDesPlacesReelles: Math.round(somme * 100) / 100,
    hauteurConteneurEnBas: Math.round(bas.conteneur * 100) / 100,
    hauteurConteneurEnHaut: Math.round(debut.conteneur * 100) / 100,
    ecartMaxEntrePas: Math.round(Math.max(...second.map((r) => Math.abs(r.conteneur - bas.conteneur))) * 100) / 100,
  };
  test.info().annotations.push({ type: "mesure", description: JSON.stringify(mesure) });

  // La hauteur du conteneur est la somme des hauteurs réelles des lignes.
  expect(Math.abs(bas.conteneur - somme), `conteneur ${bas.conteneur} px contre somme des lignes ${somme} px`).toBeLessThanOrEqual(TOLERANCE_PX);

  // Elle ne change pas d'un bout à l'autre du défilement (dérive de la barre de défilement).
  for (const r of second) {
    expect(
      Math.abs(r.conteneur - bas.conteneur),
      `hauteur du conteneur à y = ${r.y} (${r.conteneur} px) contre tout en bas (${bas.conteneur} px)`,
    ).toBeLessThanOrEqual(TOLERANCE_PX);
  }

  if (isMobile) {
    // Une carte à ligne simple vaut l'estimation : sinon chaque carte non encore vue décale la page.
    expect(
      Math.abs(estimee - typique),
      `estimation d'une carte (HAUTEUR_CARTE_PX) ${estimee} px contre place réelle typique ${typique} px`,
    ).toBeLessThanOrEqual(1);
  } else {
    // Ordinateur : les lignes ne sont pas mesurées, leur taille est une constante (HAUTEUR_LIGNE_PX). Écart cumulé sur tout le stock.
    expect(
      Math.abs(estimee - typique) * ARTICLES,
      `taille de ligne supposée (HAUTEUR_LIGNE_PX) ${estimee} px contre ${typique} px réels, sur ${ARTICLES} articles`,
    ).toBeLessThanOrEqual(TOLERANCE_PX);
    // Et la hauteur totale n'a jamais bougé non plus pendant le premier passage, quand rien n'était encore monté.
    for (const r of premier) {
      expect(
        Math.abs(r.conteneur - bas.conteneur),
        `hauteur du conteneur à y = ${r.y} au premier passage (${r.conteneur} px) contre tout en bas (${bas.conteneur} px)`,
      ).toBeLessThanOrEqual(TOLERANCE_PX);
    }
  }

  expect(garde.bloquees).toEqual([]);
});
