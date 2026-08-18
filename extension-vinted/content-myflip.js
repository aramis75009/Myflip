// extension-vinted/content-myflip.js
//
// Content script injecté sur tout le domaine MyFlip (voir manifest.json —
// élargi depuis `/mise-en-vente*` pour couvrir aussi `/compte`, cf. ruling
// Task 14). Deux responsabilités indépendantes, chacune activée seulement
// sur la page où elle a un sens :
//
//   1. /mise-en-vente : écoute le CustomEvent "myflip:publier-vinted" (émis
//      par app/mise-en-vente/_publierVinted.ts, Task 8) et le transmet au
//      service worker (Task 13) sous forme de message runtime.
//   2. /compte : copie best-effort des réglages de délai anti-ban
//      (ExtensionVinted.tsx, Task 9) depuis le DOM vers
//      browser.storage.local — seule voie d'accès pour le service worker,
//      qui n'a pas d'API MyFlip dédiée pour les lire (cf. commentaire
//      lireDelaiRegle() dans background.js).
//
// `location.pathname` est lu une seule fois à l'injection. Une navigation
// SPA (next/link) d'une page matchée vers l'autre sans rechargement complet
// ne re-déclenche pas ce script — limite connue, sans impact pratique tant
// que l'utilisateur charge /compte au moins une fois par changement (accès
// direct, rafraîchissement, ou navigation depuis une page NON matchée par
// l'extension).

if (location.pathname.startsWith("/mise-en-vente")) {
  ecouterPublicationVinted();
}

if (location.pathname.startsWith("/compte")) {
  synchroniserDelaiVinted();
}

/**
 * Capture l'événement de publication émis par la page /mise-en-vente et le
 * transmet au service worker. Forme du message : contrat fixé par le
 * handler "myflip:mise-en-file" dans background.js (Task 13) — entryId,
 * titre, description, prix, photos.
 */
function ecouterPublicationVinted() {
  window.addEventListener("myflip:publier-vinted", async (e) => {
    const { articleId, titre, description, prix, photos } = e.detail;
    // photos: Blob[] — le structured clone de runtime.sendMessage gère les
    // Blob nativement sur Firefox (vérifié en Task 10 spike ; ce projet est
    // Firefox-only, pas de fallback ArrayBuffer/base64 nécessaire).
    await browser.runtime.sendMessage({
      type: "myflip:mise-en-file",
      entryId: articleId,
      titre,
      description,
      prix,
      photos,
    });
  });
}

/**
 * Copie best-effort des bornes de délai (ExtensionVinted.tsx) vers
 * browser.storage.local, sous les clés `delaiMin`/`delaiMax` lues par
 * lireDelaiRegle() dans background.js.
 *
 * Pas d'API dédiée pour lire UserSettings.delaiVintedMinMinutes/MaxMinutes
 * depuis l'extension (invariant du design) : seule source disponible, le
 * DOM des deux <input> de /compte (id stables `delai-vinted-min` /
 * `delai-vinted-max`, cf. ExtensionVinted.tsx). Ces champs sont désactivés
 * tant que le premier GET des réglages n'a pas résolu (pretAModifier) — on
 * n'écrit donc rien tant qu'ils sont `disabled`, pour ne jamais écraser une
 * valeur déjà enregistrée en storage par un vide de chargement transitoire.
 *
 * Signal d'écriture : l'événement "change" natif des deux <input>, qui
 * couvre à la fois la perte de focus après saisie (le même moment où
 * ExtensionVinted.tsx déclenche sa propre sauvegarde via onBlur) et un
 * ajustement au clavier/spinner sans blur. Une synchronisation initiale est
 * aussi faite dès que les champs apparaissent activés, pour couvrir le cas
 * où Aramis visite /compte sans rien modifier (les valeurs déjà
 * enregistrées côté serveur doivent quand même atteindre le storage de
 * l'extension).
 */
function synchroniserDelaiVinted() {
  const TIMEOUT_MS = 20_000;
  const debut = Date.now();

  const observer = new MutationObserver(essayerAttacher);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  essayerAttacher();

  function essayerAttacher() {
    const champMin = document.getElementById("delai-vinted-min");
    const champMax = document.getElementById("delai-vinted-max");
    if (!(champMin instanceof HTMLInputElement) || !(champMax instanceof HTMLInputElement)) {
      if (Date.now() - debut > TIMEOUT_MS) observer.disconnect();
      return;
    }
    observer.disconnect();

    const synchroniser = () => copierDelaiVersStorage(champMin, champMax);
    champMin.addEventListener("change", synchroniser);
    champMax.addEventListener("change", synchroniser);
    // Sync initiale : uniquement si les champs sont déjà activés (données
    // chargées), sinon on attend le prochain "change" — inutile de poller,
    // le premier changement utile viendra soit de l'utilisateur, soit ne
    // viendra jamais (rien à copier de toute façon).
    if (!champMin.disabled && !champMax.disabled) synchroniser();
  }
}

/** Chaîne de saisie → entier ou `null` (champ vide = borne non réglée). Même
 * règle que versNombre() dans ExtensionVinted.tsx. */
function versNombre(v) {
  const s = v.trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

async function copierDelaiVersStorage(champMin, champMax) {
  if (champMin.disabled || champMax.disabled) return;
  const delaiMin = versNombre(champMin.value);
  const delaiMax = versNombre(champMax.value);
  await browser.storage.local.set({ delaiMin, delaiMax });
}
