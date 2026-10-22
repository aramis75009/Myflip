// Studio journey, screen side: the action sentence of a colourway card, the
// next action of a colourway sheet, the catalogue filters kept in the URL, and
// how a photo drop is spread over the board.
//
// PURE and isomorphic: no React, no network, no database. The screens pass
// data already read; app/studio/_parcours.test.ts pins the rules.

import { pluriel } from "@/lib/format";
import { FILTRES_ACCUEIL, MAX_PRISES, estGeneration, type FiltreAccueil, type Generation } from "@/lib/studioCases";

// ── Catalogue: one action sentence per colourway ────────────────────────────

/** What a colourway is waiting for, in work order. */
export type GenreAction = "juger" | "photographier" | "generer" | "rien";

export type ActionCarte = {
  genre: GenreAction;
  /** Verb first, what the click leads to: « Juger 3 images ». */
  phrase: string;
  /** Why, in a few words: « 9 / 15 prises · 6 variantes libres ». */
  detail: string;
};

/** The fields of a catalogue card the action depends on (CarteColoris satisfies it). */
export type CarteAction = {
  chezMoi: number | null;
  prises: number;
  libres: number;
  cases: number;
  aJuger: number;
  prochain: string | null;
};

const prises = (n: number) => `${n} / ${MAX_PRISES} prises`;

/**
 * The next thing to do on a colourway, in work order: judge what is waiting
 * (money already spent), photograph a bag that has no photo, generate for the
 * next bag, or nothing.
 */
export function actionCarte(c: CarteAction): ActionCarte {
  const chezMoi = c.chezMoi ?? 0;
  if (c.aJuger > 0) {
    return { genre: "juger", phrase: `Juger ${pluriel(c.aJuger, "image", "images")}`, detail: "générées, en attente de ta décision" };
  }
  if (c.prises === 0) {
    if (chezMoi > 0) return { genre: "photographier", phrase: "Photographier le sac", detail: `${prises(0)} · ${chezMoi} chez toi` };
    return { genre: "rien", phrase: "Rien à préparer", detail: c.chezMoi === null ? "hors catalogue SacBase" : "aucun sac chez toi" };
  }
  if (c.prochain) {
    if (c.libres > 0) {
      return {
        genre: "generer",
        phrase: `Générer pour ${c.prochain}`,
        detail: `${prises(c.prises)} · ${pluriel(c.libres, "variante libre", "variantes libres")}`,
      };
    }
    return { genre: "rien", phrase: "Plus de variante libre", detail: "ajoute un prompt d’angle dans les Réglages" };
  }
  return { genre: "rien", phrase: "Rien à préparer", detail: c.chezMoi === null ? "hors catalogue SacBase" : "chaque sac a déjà son annonce" };
}

/** Group order of the catalogue: what costs or blocks first. */
export const ORDRE_GENRES: readonly GenreAction[] = ["juger", "photographier", "generer", "rien"];

export const TITRES_GENRES: Record<GenreAction, string> = {
  juger: "À juger",
  photographier: "À photographier",
  generer: "À générer",
  rien: "Rien à préparer",
};

/** Cards grouped by action, in `ORDRE_GENRES` order; empty groups are left out. */
export function regrouperParAction<C extends CarteAction>(cartes: readonly C[]): { genre: GenreAction; cartes: C[] }[] {
  const groupes = new Map<GenreAction, C[]>(ORDRE_GENRES.map((g) => [g, []]));
  for (const c of cartes) groupes.get(actionCarte(c).genre)!.push(c);
  return ORDRE_GENRES.flatMap((genre) => {
    const liste = groupes.get(genre)!;
    return liste.length > 0 ? [{ genre, cartes: liste }] : [];
  });
}

// ── Catalogue: filters in the URL ───────────────────────────────────────────

export type FiltresCatalogue = { generation: Generation | null; filtre: FiltreAccueil | null; q: string };

/** sessionStorage key of the catalogue query: « Tous les coloris » on a sheet goes back to it. */
export const CLE_RETOUR_CATALOGUE = "myflip-studio-catalogue";

export const FILTRES_VIDES: FiltresCatalogue = { generation: null, filtre: null, q: "" };

const estFiltre = (v: unknown): v is FiltreAccueil => FILTRES_ACCUEIL.includes(v as FiltreAccueil);

/** Reads `?generation=V2&filtre=a_juger&q=…`; an unknown value is ignored, never trusted. */
export function lireFiltres(params: { get(nom: string): string | null }): FiltresCatalogue {
  const generation = params.get("generation");
  const filtre = params.get("filtre");
  return {
    generation: estGeneration(generation) ? generation : null,
    filtre: estFiltre(filtre) ? filtre : null,
    q: (params.get("q") ?? "").slice(0, 80),
  };
}

/** The query string of the filters, without the leading « ? » ; empty when nothing is filtered. */
export function ecrireFiltres(f: FiltresCatalogue): string {
  const p = new URLSearchParams();
  if (f.generation) p.set("generation", f.generation);
  if (f.filtre) p.set("filtre", f.filtre);
  const q = f.q.trim();
  if (q) p.set("q", q);
  return p.toString();
}

// ── Sheet: the next action ──────────────────────────────────────────────────

/** The five sections of a sheet, in work order. */
export const ETAPES = ["photos", "angles", "generation", "a-juger", "validees"] as const;
export type Etape = (typeof ETAPES)[number];

export type EtatFiche = {
  photos: number;
  angles: number;
  /** Images waiting for a decision (all bags). */
  aJuger: number;
  /** Bag the next images are made for; null = no bag without a listing. */
  cible: string | null;
  /** Cells picked for the target bag (automatic choice, or Aramis's). */
  choisies: number;
  /** Photos that still have no image (validated or to judge) for the target bag. */
  sansImage: number;
  /** Images validated for the target bag. */
  validees: number;
};

export type ProchaineAction = {
  etape: Etape;
  titre: string;
  detail: string;
  /** Label of the button that opens the section. */
  bouton: string;
  /** The action is done elsewhere (Studio settings) rather than in a section. */
  reglages?: true;
};

export function prochaineAction(e: EtatFiche): ProchaineAction {
  if (e.aJuger > 0) {
    return {
      etape: "a-juger",
      titre: `Juger ${pluriel(e.aJuger, "image", "images")}`,
      detail: "Valide ou rejette chacune : seule une image validée part dans l’annonce de son sac.",
      bouton: "Juger maintenant",
    };
  }
  if (e.photos === 0) {
    return {
      etape: "photos",
      titre: "Photographier le sac",
      detail: "Dépose 14 à 15 vraies photos d’un coup : elles remplissent les cases libres de la planche.",
      bouton: "Ouvrir la planche",
    };
  }
  if (e.angles === 0) {
    return {
      etape: "angles",
      titre: "Écrire les prompts d’angle",
      detail: "Sans prompt d’angle, il n’y a rien à générer. Ils se règlent dans les Réglages du Studio.",
      bouton: "Réglages du Studio",
      reglages: true,
    };
  }
  if (!e.cible) {
    return {
      etape: "validees",
      titre: "Rien à préparer",
      detail: "Aucun sac de ce coloris n’attend d’annonce. Les photos restent prêtes pour le prochain.",
      bouton: "Voir les validées",
    };
  }
  if (e.choisies > 0) {
    return {
      etape: "generation",
      titre: `Générer ${pluriel(e.choisies, "variante", "variantes")} pour ${e.cible}`,
      detail: "Une variante par photo encore sans image pour ce sac. Vérifie les angles choisis, puis lance.",
      bouton: "Préparer la génération",
    };
  }
  if (e.sansImage > 0) {
    return {
      etape: "angles",
      titre: "Plus de case libre",
      detail: `${pluriel(e.sansImage, "photo n’a", "photos n’ont")} plus d’angle libre pour ${e.cible} : ajoute un prompt d’angle dans les Réglages du Studio.`,
      bouton: "Voir les angles",
    };
  }
  if (e.photos < MAX_PRISES - 1) {
    return {
      etape: "photos",
      titre: "Compléter la planche",
      detail: `${prises(e.photos)} : chaque prise ajoutée donne une variante de plus pour ${e.cible}.`,
      bouton: "Ouvrir la planche",
    };
  }
  return {
    etape: "validees",
    titre: `${e.cible} est prêt`,
    detail: `${pluriel(e.validees, "image validée partira", "images validées partiront")} dans son annonce.`,
    bouton: "Voir les validées",
  };
}

// ── Board: spreading a drop over the free cells ─────────────────────────────

export type Repartition<F> = { places: { fichier: F; ordre: number }[]; surplus: F[] };

/**
 * Places dropped files on the free cells, in order; dropped ON an empty cell,
 * the first file takes that cell. What does not fit is RETURNED, never
 * silently dropped: the screen names it (the whole drop used to be refused).
 */
export function repartirDepot<F>(fichiers: readonly F[], libres: readonly number[], caseVisee: number | null = null): Repartition<F> {
  const ordres = caseVisee !== null && libres.includes(caseVisee) ? [caseVisee, ...libres.filter((o) => o !== caseVisee)] : [...libres];
  return {
    places: fichiers.slice(0, ordres.length).map((fichier, i) => ({ fichier, ordre: ordres[i] })),
    surplus: fichiers.slice(ordres.length),
  };
}

/** The toast of a drop that did not fit: how many, which ones, and what to do. */
export function messageSurplus(noms: readonly string[]): string {
  const n = noms.length;
  const liste = n > 4 ? `${noms.slice(0, 4).join(", ")}…` : noms.join(", ");
  return `${pluriel(n, "photo en trop n’a", "photos en trop n’ont")} pas été importée${n > 1 ? "s" : ""} : ${liste}. Retire ou remplace une photo pour ${n > 1 ? "les " : "l’"}ajouter.`;
}

/** Board after moving photo `id` to `ordre`: the photo already there (if any) takes the old place. */
export function deplacer<P extends { id: string; ordre: number }>(photos: readonly P[], id: string, ordre: number): P[] {
  const source = photos.find((p) => p.id === id);
  if (!source || source.ordre === ordre) return [...photos];
  return photos.map((p) => (p.id === id ? { ...p, ordre } : p.ordre === ordre ? { ...p, ordre: source.ordre } : p));
}
