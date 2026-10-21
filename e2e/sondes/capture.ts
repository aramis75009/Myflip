/**
 * Capture CIBLÉE d'une sonde : e2e/captures.nosync/<serie>/<projet>/sonde-<id>[-<suffixe>].png.
 *
 * Contrairement à `capturer` (e2e/outils/capture.ts, page entière), on photographie
 * la zone qui prouve la mesure : un élément, un rectangle, ou la fenêtre. Jamais
 * d'échec : une capture ratée donne `null` et la sonde garde sa mesure.
 */
import path from "node:path";

import { test, type Locator, type Page } from "@playwright/test";

import { DOSSIERS } from "../outils/environnement";
import { cheminRelatif } from "./resultats";

export type CibleCapture = Locator | { x: number; y: number; width: number; height: number } | null | undefined;

const ID_RE = /^[a-z0-9][a-z0-9._-]*$/i;

export async function capturerSonde(page: Page, id: string, suffixe: string | null, cible?: CibleCapture, marge = 12): Promise<string | null> {
  try {
    const nom = suffixe ? `sonde-${id}-${suffixe}` : `sonde-${id}`;
    if (!ID_RE.test(nom)) return null;
    const fichier = path.join(DOSSIERS.captures, test.info().project.name, `${nom}.png`);
    const fenetre = page.viewportSize() ?? { width: 1440, height: 900 };

    let clip: { x: number; y: number; width: number; height: number } | undefined;
    if (cible) {
      const boite = "boundingBox" in cible ? await cible.boundingBox() : cible;
      if (boite) {
        const x = Math.max(0, boite.x - marge);
        const y = Math.max(0, boite.y - marge);
        clip = {
          x,
          y,
          width: Math.max(1, Math.min(fenetre.width - x, boite.width + 2 * marge)),
          height: Math.max(1, Math.min(fenetre.height - y, boite.height + 2 * marge)),
        };
      }
    }
    await page.screenshot({
      path: fichier,
      fullPage: false,
      clip,
      animations: "disabled",
      caret: "hide",
      style: "nextjs-portal { display: none !important; }",
      timeout: 15_000,
    });
    return cheminRelatif(fichier);
  } catch {
    return null;
  }
}
