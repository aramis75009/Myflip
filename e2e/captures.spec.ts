/**
 * Captures de référence de TOUTES les routes (PRD refonte § 12-13, étape 1) :
 * une capture pleine page par route du catalogue (e2e/catalogue-routes.ts)
 * dans les 4 projets (clair / sombre × 1440 / 390), compte demo ou public,
 * plus les écrans à état vide du compte neuf.
 *
 * Chaque test vérifie : le statut HTTP du document, l'URL finale (pas de
 * renvoi silencieux vers /login), le thème posé, aucune exception de page
 * (pageerror) et aucune écriture tentée (garde d'écriture). Les console.error
 * sont recopiés dans e2e/rapports/<serie>/captures.jsonl SANS faire échouer :
 * ils décrivent l'application « avant ».
 *
 * Le Studio à 390 px est capturé mais étiqueté « informatif » (annotation et
 * rapport) : il est desktop uniquement.
 */
import fs from "node:fs";
import path from "node:path";

import { ROUTES, ROUTES_NEUF, idCapture, type EntreeRoute } from "./catalogue-routes";
import { capturer } from "./outils/capture";
import { bloquerEcritures } from "./outils/ecritures";
import { RACINE } from "./outils/environnement";
import { consignerCapture } from "./outils/rapport";
import { expect, test } from "./outils/test";

test.describe.configure({ mode: "parallel" });

function declarer(r: EntreeRoute): void {
  test.describe(`${r.compte}`, () => {
    test.use({ compte: r.compte });

    test(`${idCapture(r)} — ${r.chemin}`, async ({ page, themeMyflip, journalConsole, isMobile }) => {
      const informatif = isMobile && r.informatifMobile ? r.informatifMobile : undefined;
      if (informatif) test.info().annotations.push({ type: "informatif", description: informatif });
      if (r.mouvementReduit) await page.emulateMedia({ reducedMotion: "reduce" });
      const garde = await bloquerEcritures(page);

      const reponse = await page.goto(r.chemin);
      expect(reponse, "réponse du document").not.toBeNull();
      expect(reponse!.status(), "statut HTTP").toBe(r.statut);
      if (r.urlFinale) await expect(page).toHaveURL(r.urlFinale);
      else if (r.compte !== "aucun") await expect(page, "session perdue : renvoi vers /login").not.toHaveURL(/\/login/);

      for (const repere of r.attente(page)) await expect(repere).toBeVisible();

      // Thème posé avant chargement (initScript + script de lib/themeMeta.ts) : depuis le lot L0 le script
      // écrit TOUJOURS un data-theme explicite sur <html>, "light" comme "dark" (avant L0 : "dark" seulement).
      const html = page.locator("html");
      const attendu = themeMyflip;
      const themeOk = await expect
        .poll(() => html.getAttribute("data-theme"), { timeout: 5_000 })
        .toBe(attendu)
        .then(() => true)
        .catch(() => false);
      const constats: string[] = [];
      if (!themeOk) {
        const recu = await html.getAttribute("data-theme");
        constats.push(
          `thème « ${themeMyflip} » demandé, <html data-theme> vaut ${recu === null ? "(absent)" : `« ${recu} »`}${r.themeInstable ? ` — ${r.themeInstable}` : ""}`,
        );
        test.info().annotations.push({ type: "constat", description: constats[0] });
      }

      const fichier = await capturer(page, idCapture(r), { pleinePage: true });

      consignerCapture({
        type: "route",
        id: idCapture(r),
        chemin: r.chemin,
        compte: r.compte,
        statut: reponse!.status(),
        informatif,
        constats: constats.length > 0 ? constats : undefined,
        fichiers: [fichier],
        console: journalConsole.erreurs,
      });

      expect(journalConsole.erreurs.filter((e) => e.type === "pageerror"), "exceptions de page").toEqual([]);
      expect(garde.bloquees, "écritures tentées pendant l'affichage").toEqual([]);
      if (!r.themeInstable) expect(themeOk, `thème « ${themeMyflip} » appliqué à <html>`).toBe(true);
    });
  });
}

for (const r of [...ROUTES, ...ROUTES_NEUF]) declarer(r);

test("le catalogue couvre les 21 routes de l'étude", async () => {
  test.skip(test.info().project.name !== "desktop-clair", "Contrôle statique, une seule fois.");
  const etude = JSON.parse(
    fs.readFileSync(path.join(RACINE, "docs/refonte/etude-2026-10-20/routes-etats.json"), "utf8"),
  ) as { routes: { path: string }[] };
  const couvertes = new Set([...ROUTES, ...ROUTES_NEUF].map((r) => r.etude));
  const manquantes = etude.routes.map((r) => r.path).filter((p) => !couvertes.has(p));
  expect(manquantes, "routes de l'étude sans capture").toEqual([]);
  expect(etude.routes).toHaveLength(21);

  const ids = [...ROUTES, ...ROUTES_NEUF].map(idCapture);
  expect(new Set(ids).size, "identifiants de capture en double").toBe(ids.length);
});
