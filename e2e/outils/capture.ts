/**
 * Capture de référence : e2e/captures.nosync/<serie>/<projet>/<id>.png.
 *
 * Avant de déclencher la photo : chargement terminé, réseau calme (aucune
 * requête en cours pendant 700 ms et fil principal libéré, voir calme.ts ;
 * sinon la capture échoue au bout de `delaiReseauMs`), polices prêtes (document.fonts.ready), puis « stabilisation » :
 * les images visibles sont chargées et le texte de la page ne bouge plus
 * (compteurs animés en requestAnimationFrame, que `animations: "disabled"` ne
 * fige pas). Animations CSS figées par Playwright, curseur masqué.
 * L'indicateur et la surcouche de `next dev` (<nextjs-portal>) sont masqués :
 * ils n'existent pas en production. Les erreurs qu'elle afficherait restent
 * dans `journalConsole`.
 */
import path from "node:path";

import { test, type Locator, type Page } from "@playwright/test";

import { attendreCalme, requetesEnCours } from "./calme";
import { DOSSIERS } from "./environnement";

export type OptionsCapture = {
  /** Page entière (défaut) ou seulement la fenêtre. */
  pleinePage?: boolean;
  /** Zones à masquer (dates, compteurs animés…). */
  masques?: Locator[];
  /** Attente supplémentaire après le calme réseau, à éviter : préférer `stabiliser`. */
  attenteMs?: number;
  /** Plafond d'attente du calme réseau (défaut 60 s, voir calme.ts). Au-delà, la capture échoue. */
  delaiReseauMs?: number;
  /**
   * Faux pour un état éphémère (toast, réponse retenue par page.route) : la
   * photo part dès les polices prêtes, sans attendre le réseau ni la
   * stabilisation. Défaut : vrai.
   */
  attendreReseau?: boolean;
  /** Attendre images chargées et texte immobile (défaut : vrai si `attendreReseau`). */
  stabiliser?: boolean;
  /** Garder l'indicateur et la surcouche de `next dev` sur l'image. */
  garderOutilsNext?: boolean;
};

const ID_RE = /^[a-z0-9][a-z0-9._-]*$/i;

/**
 * Attend que les images visibles soient décodées et que le texte de la page
 * cesse de changer (deux relevés identiques à 250 ms d'écart). Borné : au-delà
 * de `plafondMs` elle rend faux et `capturer` échoue.
 */
export async function stabiliser(page: Page, plafondMs = 15_000): Promise<boolean> {
  const fin = Date.now() + plafondMs;
  let precedent = "";
  while (Date.now() < fin) {
    const releve = await page.evaluate(() => {
      const visibles = Array.from(document.images).filter((i) => {
        const r = i.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight && i.loading !== "lazy";
      });
      const imagesPretes = visibles.every((i) => i.complete);
      return { imagesPretes, texte: document.body?.innerText ?? "" };
    });
    if (releve.imagesPretes && releve.texte === precedent) return true;
    precedent = releve.texte;
    await page.waitForTimeout(250);
  }
  return false;
}

export async function capturer(page: Page, id: string, options: OptionsCapture = {}): Promise<string> {
  if (!ID_RE.test(id)) throw new Error(`Identifiant de capture invalide : « ${id} » (lettres, chiffres, . _ -).`);
  const info = test.info();
  const chemin = path.join(DOSSIERS.captures, info.project.name, `${id}.png`);
  const attendreReseau = options.attendreReseau ?? true;

  if (attendreReseau) {
    await page.waitForLoadState("load");
    // Pas `waitForLoadState("networkidle")` : il est collant (voir calme.ts). Pas de capture « quand même » :
    // une page à moitié chargée ferait une référence différente d'un lancement à l'autre.
    if (!(await attendreCalme(page, { plafondMs: options.delaiReseauMs }))) {
      throw new Error(`${id} : réseau jamais calme (requêtes en cours : ${requetesEnCours(page).join(", ") || "aucune"}).`);
    }
  }
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  if (options.stabiliser ?? attendreReseau) {
    if (!(await stabiliser(page))) throw new Error(`${id} : page jamais immobile (images non décodées ou texte qui change encore après 15 s).`);
  }
  if (options.attenteMs) await page.waitForTimeout(options.attenteMs);

  await page.screenshot({
    path: chemin,
    fullPage: options.pleinePage ?? true,
    animations: "disabled",
    caret: "hide",
    mask: options.masques,
    style: options.garderOutilsNext ? undefined : "nextjs-portal { display: none !important; }",
  });
  return chemin;
}
