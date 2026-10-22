/**
 * Base d'accessibilité de la refonte : axe-core (@axe-core/playwright) sur chaque
 * route du catalogue commun de la suite (e2e/catalogue-routes.ts, via
 * e2e/sondes/routes.ts : pages publiques, compte demo, compte neuf et leurs
 * variantes), dans les 4 projets (clair et sombre, 1440 et 390 px), règles WCAG
 * 2.0 A/AA, 2.1 AA et 2.2 AA.
 *
 * Résultats agrégés dans e2e/rapports/<serie>/a11y.json : une entrée par route
 * (identifiant de capture du catalogue, `variante`) et par projet, avec les
 * violations par règle (impact, nombre d'éléments, cibles) et le décompte par impact. Mode normal : ne fait JAMAIS échouer sur une violation (on
 * documente l'avant). A11Y_STRICT=1 : échoue sur toute violation serious ou critical.
 *
 * Aucune touche n'est pressée : sur /studio/<cle>, V et R valident ou rejettent
 * sur-le-champ. Les écritures sont de toute façon avortées par le filet de
 * e2e/sondes/test.ts.
 */
import AxeBuilder from "@axe-core/playwright";

import { aller } from "./sondes/pages";
import { enregistrerA11y, type ViolationA11y } from "./sondes/resultats";
import { etiquette, ROUTES_SONDES } from "./sondes/routes";
import { expect, test } from "./sondes/test";

const A11Y_STRICT = process.env.A11Y_STRICT === "1";
const BALISES = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];
const IMPACTS = ["minor", "moderate", "serious", "critical"] as const;

// Les types de page d'@axe-core/playwright viennent de sa propre copie de playwright-core,
// un peu en retard sur @playwright/test 1.63 : même objet à l'exécution, types différents.
type PageAxe = ConstructorParameters<typeof AxeBuilder>[0]["page"];

const LIBELLE_COMPTE = { aucun: "pages publiques", demo: "compte demo", neuf: "compte neuf" } as const;

for (const compte of ["aucun", "demo", "neuf"] as const) {
  test.describe(`axe · ${LIBELLE_COMPTE[compte]}`, () => {
    test.use({ compte });

    for (const route of ROUTES_SONDES.filter((r) => r.compte === compte)) {
      test(etiquette(route), async ({ page }) => {
        test.setTimeout(240_000);
        const projet = test.info().project.name;
        if (route.entree.mouvementReduit) await page.emulateMedia({ reducedMotion: "reduce" });
        await aller(page, route.chemin, { attente: route.entree.attente(page) });

        // L'indicateur de `next dev` (<nextjs-portal>, rond « N » fixe en bas à gauche) n'existe pas en
        // production : il recouvre le dock mobile et fait varier les « incomplete » d'axe (contraste
        // indécidable sous un élément qui chevauche). `exclude` ne l'ôte pas du calcul de chevauchement.
        await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
        const resultat = await new AxeBuilder({ page: page as unknown as PageAxe }).withTags(BALISES).exclude("nextjs-portal").analyze();

        const violations: ViolationA11y[] = resultat.violations.map((v) => ({
          regle: v.id,
          impact: v.impact ?? null,
          aide: v.help,
          noeuds: v.nodes.length,
          cibles: v.nodes.slice(0, 20).map((n) => n.target.map((t) => (Array.isArray(t) ? t.join(" >> ") : String(t))).join(" >> ")),
        }));
        const parImpact: Record<string, number> = {};
        const noeudsParImpact: Record<string, number> = {};
        for (const i of [...IMPACTS, "inconnu"]) {
          parImpact[i] = 0;
          noeudsParImpact[i] = 0;
        }
        for (const v of violations) {
          const cle = v.impact ?? "inconnu";
          parImpact[cle] += 1;
          noeudsParImpact[cle] += v.noeuds;
        }
        const graves = parImpact.serious + parImpact.critical;

        await enregistrerA11y({
          route: route.chemin,
          variante: route.variante,
          projet,
          violations,
          parImpact,
          noeudsParImpact,
          totalRegles: violations.length,
          totalNoeuds: violations.reduce((n, v) => n + v.noeuds, 0),
          graves,
          regleReussies: resultat.passes.length,
          incompletes: resultat.incomplete.length,
        });

        test.info().annotations.push({
          type: "axe",
          description: `${violations.length} règle(s) en infraction (serious ou critical : ${graves}) · ${route.chemin}`,
        });
        if (A11Y_STRICT) {
          expect(graves, `violations serious/critical : ${violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.regle).join(", ")}`).toBe(0);
        }
      });
    }
  });
}
