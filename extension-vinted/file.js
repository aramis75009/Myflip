// extension-vinted/file.js
//
// L'ordonnanceur de la file de publication, en fonctions PURES : ni
// IndexedDB, ni browser.*, ni horloge implicite. C'est ce qui le rend
// testable sous Vitest en environnement node, comme l'était pairing.js —
// qu'il remplace.
//
// Une entrée de file :
//   { entryId, etat, ts, cibleMs, tabId, titre, description, prix,
//     photos, vinted }
//
//   etat : "en-attente" — mise en file, pas encore ouverte
//          "en-cours"   — son onglet Vinted est ouvert et se remplit
//          "echouee"    — le remplissage a échoué ; la chaîne est suspendue
//   ts      : epoch ms de mise en file. Donne l'ordre de traitement.
//   cibleMs : epoch ms ABSOLU à partir duquel l'onglet peut s'ouvrir.
//             null tant que le délai anti-ban n'a pas été tiré.

/**
 * Que faire, maintenant ?
 *
 * L'ordre des tests n'est pas cosmétique :
 *
 * 1. `suspendu` d'abord. Un échec arrête TOUT. Cinq brouillons ratés à la
 *    suite coûtent plus cher qu'un seul, et la cause est presque toujours
 *    commune (Vinted a changé son DOM) — enchaîner ne ferait qu'aggraver.
 * 2. `occupe` ensuite. Un seul article en vol à la fois : cinq onglets
 *    ouverts d'un coup seraient à la fois un signal de robot évident et un
 *    moyen sûr de saturer la mémoire du worker avec cent photos.
 * 3. Puis la plus ancienne entrée en attente, par `ts` croissant.
 */
export function prochaineAction(entrees, maintenant) {
  const echouee = entrees.find((e) => e.etat === "echouee");
  if (echouee) return { type: "suspendu", entryId: echouee.entryId };

  const enCours = entrees.find((e) => e.etat === "en-cours");
  if (enCours) return { type: "occupe", entryId: enCours.entryId };

  const attente = entrees
    .filter((e) => e.etat === "en-attente")
    .sort((a, b) => a.ts - b.ts);
  const suivante = attente[0];
  if (!suivante) return { type: "rien" };

  if (suivante.cibleMs == null) return { type: "planifier", entryId: suivante.entryId };
  if (suivante.cibleMs > maintenant) {
    return {
      type: "attendre",
      entryId: suivante.entryId,
      dansMs: suivante.cibleMs - maintenant,
    };
  }
  return { type: "ouvrir", entryId: suivante.entryId };
}

/**
 * Tire un délai en millisecondes dans une fourchette exprimée en MINUTES.
 *
 * `alea` est injecté (au lieu d'appeler Math.random ici) pour que les bornes
 * soient testables. La fourchette est réordonnée si elle arrive à l'envers :
 * les deux champs de /compte sont saisis à la main, rien ne garantit
 * min <= max, et un délai négatif ouvrirait tous les onglets d'un coup —
 * exactement le comportement que ce garde-fou existe pour empêcher.
 */
export function tirerDelaiMs(minMinutes, maxMinutes, alea) {
  const bas = Math.min(minMinutes, maxMinutes);
  const haut = Math.max(minMinutes, maxMinutes);
  return Math.round((bas + alea() * (haut - bas)) * 60_000);
}

/**
 * Entrées trop vieilles pour valoir quelque chose. Une entrée « en-cours »
 * n'est JAMAIS purgée : son onglet est ouvert, et la frappe simulée d'une
 * description peut à elle seule dépasser la minute.
 */
export function entreesPerimees(entrees, maintenant, ttlMs) {
  return entrees
    .filter((e) => e.etat !== "en-cours" && maintenant - e.ts > ttlMs)
    .map((e) => e.entryId);
}
