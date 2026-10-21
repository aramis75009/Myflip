/**
 * globalTeardown de la suite e2e : arrête Postgres, remet next-env.d.ts sur
 * `.next`, puis FAIT ÉCHOUER la suite si le serveur a tenté de joindre
 * openrouter.ai (journal de la garde réseau, e2e/garde-reseau.mjs).
 *
 * Il passe AVANT l'arrêt des webServer (ordre inverse de la mise en place) :
 * le journal est complet, les tests sont finis.
 */
import fs from "node:fs";
import path from "node:path";

import { arreterPostgres } from "./db/postgres";
import { DOSSIERS, JOURNAUX, RACINE } from "./outils/environnement";
import { lignesReseauServeur } from "./outils/journaux";

/**
 * `next dev` réécrit next-env.d.ts pour pointer sur `<distDir>/types/routes.d.ts`.
 * Laissé tel quel, `npm run typecheck` verrait deux `routes.d.ts` (celui de
 * `.next` et celui de la suite), qui déclarent les mêmes types globaux.
 */
function restaurerNextEnv(): void {
  const fichier = path.join(RACINE, "next-env.d.ts");
  if (!fs.existsSync(fichier)) return;
  const avant = fs.readFileSync(fichier, "utf8");
  const apres = avant.split(`./${DOSSIERS.distNext}/types/routes.d.ts`).join("./.next/types/routes.d.ts");
  if (apres !== avant) fs.writeFileSync(fichier, apres);
}

export default async function globalTeardown(): Promise<void> {
  await arreterPostgres();
  restaurerNextEnv();

  const refus = lignesReseauServeur().filter((l) => l.evenement === "refus");
  if (refus.length > 0) {
    const parHote = new Map<string, number>();
    for (const r of refus) parHote.set(String(r.hote), (parHote.get(String(r.hote)) ?? 0) + 1);
    console.log(
      `[e2e] Garde réseau du serveur : ${refus.length} requête(s) refusée(s) — ` +
        [...parHote].map(([h, n]) => `${h} ×${n}`).join(", ") +
        ` (${path.relative(RACINE, JOURNAUX.reseauServeur)}).`,
    );
  }
  const versOpenRouter = refus.filter((r) => /(^|\.)openrouter\.ai$/i.test(String(r.hote)));
  if (versOpenRouter.length > 0) {
    throw new Error(
      `[e2e] ÉCHEC : le serveur a tenté ${versOpenRouter.length} appel(s) vers openrouter.ai ` +
        "(refusés par la garde). OPENROUTER_BASE_URL ne s'applique pas partout : voir le journal réseau.",
    );
  }
}
