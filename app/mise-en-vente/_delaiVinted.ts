// Le délai anti-ban entre deux mises en brouillon Vinted.
//
// Ce n'est plus un réglage de compte. Il est choisi dans un pop-up au moment
// de lancer un lot, voyage avec la charge utile de l'événement, et chaque
// entrée de la file de l'extension porte le sien — ce qui permet à deux lots
// lancés avec des réglages différents de s'enchaîner sans que le second
// impose le sien au premier.
//
// PUR pour la normalisation et la validation (testées) ; les deux fonctions
// qui touchent `localStorage` sont des enveloppes minces, sans logique — même
// parti que `_persistance.ts`.

export type DelaiVinted = {
  minMinutes: number;
  maxMinutes: number;
};

/** Un délai fixe s'exprime `minMinutes === maxMinutes` : ce n'est pas un cas
 *  particulier à coder, `tirerDelaiMs()` (extension) traite déjà l'égalité. */
export type ModeDelai = "fixe" | "fourchette";

/** Premier lancement, aucune valeur retenue. Décidé avec Aramis le 08/09/2026. */
export const DELAI_PAR_DEFAUT: DelaiVinted = { minMinutes: 2, maxMinutes: 5 };

/** Clé versionnée : un futur changement de forme ne doit pas relire l'ancienne. */
export const CLE_DELAI = "mev_delai_vinted_v1";

const entierPositif = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n) && n >= 0;

/**
 * Valide une valeur relue du stockage, ou `null` si elle n'a pas exactement la
 * forme attendue. Rien de ce qui vient du `localStorage` n'est digne de
 * confiance : la clé a pu être écrite par une version antérieure, ou à la main.
 *
 * Zéro est ACCEPTÉ. « Pas de délai pour ce lot » est un choix légitime — c'est
 * même celui qu'on prend pour un essai — et le refuser obligerait à inventer
 * une valeur à la place de celle demandée.
 */
export function normaliserDelai(brut: unknown): DelaiVinted | null {
  if (!brut || typeof brut !== "object") return null;
  const d = brut as Partial<DelaiVinted>;
  if (!entierPositif(d.minMinutes) || !entierPositif(d.maxMinutes)) return null;
  if (d.minMinutes > d.maxMinutes) return null;
  return { minMinutes: d.minMinutes, maxMinutes: d.maxMinutes };
}

/** Chaîne de saisie → entier, ou `null`. Refuse le vide et les décimales :
 *  minutes entières, décision explicite du 08/09/2026. */
function versEntier(v: string): number | null {
  const s = v.trim();
  if (s === "") return null;
  // `Number("2,5")` vaut NaN, `Number("2.5")` vaut 2.5 : les deux formes de
  // décimale sont donc bien refusées, mais par deux chemins différents.
  const n = Number(s);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

/**
 * Valide la saisie du pop-up. En mode « fixe », seul `min` est lu — le second
 * champ n'est pas affiché, et sa valeur résiduelle ne doit rien décider.
 */
export function delaiDepuisSaisie(
  mode: ModeDelai,
  min: string,
  max: string,
): { ok: true; delai: DelaiVinted } | { ok: false; erreur: string } {
  const INVALIDE = "Un délai en minutes entières, à partir de 0.";

  const m = versEntier(min);
  if (m === null) return { ok: false, erreur: INVALIDE };

  if (mode === "fixe") return { ok: true, delai: { minMinutes: m, maxMinutes: m } };

  const M = versEntier(max);
  if (M === null) return { ok: false, erreur: INVALIDE };
  if (m > M) {
    return { ok: false, erreur: "Le minimum doit être inférieur ou égal au maximum." };
  }
  return { ok: true, delai: { minMinutes: m, maxMinutes: M } };
}

// ── Enveloppes localStorage (non testées : elles n'ont pas de logique) ─────

/**
 * Le dernier délai retenu, ou la valeur par défaut.
 *
 * `localStorage` et non la base : ça n'a pas à survivre à un changement de
 * machine, et ça évite une colonne — celle qu'on vient précisément de
 * supprimer. À n'appeler que côté navigateur (au clic, jamais au rendu) :
 * `window` n'existe pas au rendu serveur.
 */
export function lireDelai(): DelaiVinted {
  try {
    const brut = window.localStorage.getItem(CLE_DELAI);
    if (!brut) return DELAI_PAR_DEFAUT;
    return normaliserDelai(JSON.parse(brut)) ?? DELAI_PAR_DEFAUT;
  } catch {
    return DELAI_PAR_DEFAUT;
  }
}

export function ecrireDelai(d: DelaiVinted): void {
  try {
    window.localStorage.setItem(CLE_DELAI, JSON.stringify(d));
  } catch {
    /* stockage refusé : le réglage ne sera pas retenu, le lot part quand même */
  }
}
