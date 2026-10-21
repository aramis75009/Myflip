/**
 * `test` des sondes : celui de la suite (e2e/outils/test.ts : thème, garde
 * réseau, console, boîtes natives) plus
 *
 *  - `identite: "sonde"` : session du compte « sonde » (e2e/sondes/session.ts),
 *    en plus des comptes `demo` / `neuf` de la suite (option `compte`) ;
 *  - un FILET D'ÉCRITURE, actif partout : toute requête d'écriture (POST, PUT,
 *    PATCH, DELETE) vers /api/ (hors /api/auth/) que la sonde n'a pas simulée
 *    elle-même par `page.route` est avortée et listée dans `ecrituresBloquees`.
 *    Une sonde ne modifie donc jamais rien « par accident », et ne presse jamais
 *    V ou R sur le Studio sans avoir intercepté le PATCH ;
 *  - la vérification IA lancée toute seule à l'ouverture d'une fiche du Studio
 *    (POST /api/studio/essais/<id>/verifier) répond 503 sans atteindre le serveur.
 */
import path from "node:path";

import { DOSSIERS, cheminEtatSession } from "../outils/environnement";
import { ajouterLigne } from "../outils/journaux";
import { expect, test as base } from "../outils/test";
import { assurerSessionSonde } from "./session";

export type Identite = "defaut" | "sonde";

export type FixturesSondes = {
  identite: Identite;
  /** Projets où la sonde s'exécute ; ailleurs le test est sauté AVANT toute connexion (null = tous). */
  projetsAutorises: string[] | null;
  /** Écritures avortées par le filet, « METHODE /chemin ». */
  ecrituresBloquees: string[];
  /** Requêtes POST /verifier du Studio interceptées (jamais servies). */
  verificationsDemandees: string[];
};

export const test = base.extend<FixturesSondes>({
  identite: ["defaut", { option: true }],
  projetsAutorises: [null, { option: true }],

  storageState: async ({ identite, compte, browser, projetsAutorises }, use, testInfo) => {
    // Premier fixture résolu : sauter ici évite de créer le compte sonde ou un contexte pour rien.
    if (projetsAutorises && !projetsAutorises.includes(testInfo.project.name)) {
      testInfo.skip(true, `Prévue dans ${projetsAutorises.join(", ")} seulement.`);
    }
    if (identite === "sonde") {
      await use(await assurerSessionSonde(browser));
      return;
    }
    await use(compte === "aucun" ? undefined : cheminEtatSession(compte));
  },

  verificationsDemandees: async ({}, use) => {
    await use([]);
  },

  ecrituresBloquees: [
    async ({ context, verificationsDemandees }, use) => {
      const liste: string[] = [];
      await context.route(
        (u) => u.pathname.startsWith("/api/") && !u.pathname.startsWith("/api/auth/"),
        async (route) => {
          const requete = route.request();
          const methode = requete.method();
          const chemin = new URL(requete.url()).pathname;
          if (methode === "GET" || methode === "HEAD" || methode === "OPTIONS") {
            await route.fallback();
            return;
          }
          if (methode === "POST" && /^\/api\/studio\/essais\/[^/]+\/verifier$/.test(chemin)) {
            verificationsDemandees.push(chemin);
            await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "sonde : vérification simulée" }) });
            return;
          }
          liste.push(`${methode} ${chemin}`);
          ajouterLigne(path.join(DOSSIERS.rapports, "sondes-ecritures-avortees.jsonl"), {
            projet: test.info().project.name,
            test: test.info().titlePath.slice(-1)[0],
            requete: `${methode} ${chemin}`,
          });
          await route.abort("blockedbyclient");
        },
      );
      await use(liste);
      if (liste.length > 0) {
        test.info().annotations.push({ type: "écritures avortées", description: [...new Set(liste)].join(" ; ") });
      }
    },
    { auto: true },
  ],
});

export { expect };
