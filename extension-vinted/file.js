// extension-vinted/file.js
//
// L'ordonnanceur de la file de publication, en fonctions PURES : ni
// IndexedDB, ni browser.*, ni horloge implicite. C'est ce qui le rend
// testable sous Vitest en environnement node, comme l'était pairing.js —
// qu'il remplace.
//
// Une entrée de file :
//   { entryId, etat, ts, cibleMs, tabId, titre, description, prix,
//     photos, vinted, delai, premier }
//
//   etat : "en-attente" — mise en file, pas encore ouverte
//          "en-cours"   — son onglet Vinted est ouvert et se remplit
//          "echouee"    — le remplissage a échoué ; la chaîne est suspendue
//   ts      : epoch ms de mise en file. Donne l'ordre de traitement.
//   cibleMs : epoch ms ABSOLU à partir duquel l'onglet peut s'ouvrir.
//             null tant que le délai anti-ban n'a pas été tiré.
//   delai   : { minMinutes, maxMinutes } choisi dans le pop-up au lancement du
//             lot. Porté par CHAQUE entrée, pas par l'extension : deux lots
//             lancés avec des réglages différents s'enchaînent alors sans que
//             le second impose le sien au premier.
//   premier : posé à la mise en file, quand la file était vide. Cette entrée
//             part sans attendre.

/**
 * Fourchette utilisée quand une entrée n'en porte pas d'exploitable : entrée
 * mise en file par une version antérieure de l'extension, ou charge utile
 * abîmée en route.
 *
 * On ne replie PAS sur zéro. Un délai nul ouvrirait tous les onglets d'affilée
 * — exactement ce que ce garde-fou existe pour empêcher — et l'ancien code
 * refusait de planifier pour cette raison. Ce refus produisait un mode de
 * panne muet (rien ne partait, rien ne le disait) ; un repli prudent le
 * remplace.
 */
export const DELAI_REPLI = { minMinutes: 2, maxMinutes: 5 };

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

  if (suivante.cibleMs == null) {
    // `immediat` est LU sur l'entrée, pas déduit de l'état de la file. Le
    // critère « aucune entrée n'a encore de cibleMs » serait vrai à nouveau
    // après chaque succès — une entrée réussie est supprimée de la base — et
    // tout le lot partirait sans attendre.
    return {
      type: "planifier",
      entryId: suivante.entryId,
      immediat: suivante.premier === true,
    };
  }
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
 * elle est saisie à la main dans le pop-up de lancement, rien ne garantit
 * min <= max, et un délai négatif ouvrirait tous les onglets d'un coup —
 * exactement le comportement que ce garde-fou existe pour empêcher.
 */
export function tirerDelaiMs(minMinutes, maxMinutes, alea) {
  const bas = Math.min(minMinutes, maxMinutes);
  const haut = Math.max(minMinutes, maxMinutes);
  return Math.round((bas + alea() * (haut - bas)) * 60_000);
}

/**
 * Cette mise en file est-elle la première d'un lot ?
 *
 * Appelée par background.js AVANT d'enregistrer la nouvelle entrée, et après
 * la purge des entrées en échec : une file vide veut dire qu'aucun article
 * n'est en vol ni en attente, donc que celui qui arrive n'a personne devant
 * lui. Un article isolé envoyé pendant qu'un lot tourne n'est donc pas
 * « premier » — il rejoint la file et attend son tour, comme le veut la spec.
 */
export function estPremiereEntree(entrees) {
  return entrees.length === 0;
}

/**
 * La fourchette de délai d'une entrée, ou le repli si elle n'en porte pas
 * d'exploitable.
 *
 * Une fourchette à l'envers est laissée telle quelle : `tirerDelaiMs()` la
 * réordonne déjà, et la corriger ici ferait deux endroits à tenir d'accord.
 */
export function delaiDeLEntree(entree) {
  const d = entree && entree.delai;
  const entier = (n) => typeof n === "number" && Number.isInteger(n) && n >= 0;
  if (!d || !entier(d.minMinutes) || !entier(d.maxMinutes)) return DELAI_REPLI;
  return { minMinutes: d.minMinutes, maxMinutes: d.maxMinutes };
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
