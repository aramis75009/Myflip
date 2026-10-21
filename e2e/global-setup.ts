/**
 * globalSetup de la suite e2e.
 *
 * ORDRE RÉEL (vérifié dans @playwright/test 1.63.0, createGlobalSetupTasks) :
 * les webServer (faux serveurs puis `next dev`) démarrent AVANT le globalSetup,
 * qui passe AVANT le premier test. Conséquences :
 *  - les contrôles qui doivent précéder `next dev` (env, base locale) sont
 *    faits au chargement de playwright.config.ts (`controlerPreparation`) ;
 *  - `next dev` démarre sans base : il ne s'y connecte qu'à la première
 *    requête qui lit des données, donc après ce globalSetup ;
 *  - la base est prête (migrée et semée) avant le projet « setup » (connexion).
 */
import fs from "node:fs";
import path from "node:path";

import { demarrerPostgres, migrer, semer } from "./db/postgres";
import { DOSSIERS, JOURNAUX, RACINE, URL_APP, controlerPreparation, idLancement } from "./outils/environnement";
import { lignesReseauServeur } from "./outils/journaux";

/** Compile les pages publiques une fois : le premier test n'attend plus la compilation. */
async function chauffer(): Promise<void> {
  for (const chemin of ["/login", "/", "/legal/cgu"]) {
    try {
      await fetch(URL_APP + chemin, { redirect: "manual", signal: AbortSignal.timeout(180_000) });
    } catch {
      console.warn(`[e2e] Préchauffage de ${chemin} sans réponse (le test attendra la compilation).`);
    }
  }
}

export default async function globalSetup(): Promise<void> {
  controlerPreparation();

  // La garde réseau doit s'être chargée dans le `next dev` de CE lancement.
  const chargements = lignesReseauServeur().filter((l) => l.evenement === "chargement");
  if (chargements.length === 0) {
    throw new Error(
      "[e2e] La garde réseau (e2e/garde-reseau.mjs) ne s'est pas chargée dans le serveur Next : " +
        `aucune trace dans ${path.relative(RACINE, JOURNAUX.reseauServeur)}. Vérifier NODE_OPTIONS.`,
    );
  }

  const t0 = Date.now();
  await demarrerPostgres();
  const migration = migrer();
  const seme = semer();
  const duree = Date.now() - t0;

  fs.mkdirSync(DOSSIERS.rapports, { recursive: true });
  fs.writeFileSync(
    path.join(DOSSIERS.rapports, "base.json"),
    JSON.stringify(
      {
        lancement: idLancement(),
        migration: migration.methode,
        seed: seme ? "e2e/seed/seed-e2e.ts" : "ABSENT",
        dureeMs: duree,
        processusGardes: chargements.length,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `[e2e] Base prête en ${duree} ms (${migration.methode}${seme ? ", seed e2e" : ", SANS seed"}) ; ` +
      `garde réseau active dans ${chargements.length} processus.`,
  );

  await chauffer();
}
