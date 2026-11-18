// Studio journey, screen side: the action sentence of a colourway card, the
// catalogue filters kept in the URL, and how a photo drop is spread over the board.
//
// PURE and isomorphic: no React, no network, no database. The screens pass
// data already read; app/studio/_parcours.test.ts pins the rules.

import { pluriel } from "@/lib/format";
import { lireEtatSac, type EtatSac } from "@/lib/studioChezToi";
import { MAX_PRISES, bilanPhotos, estGeneration, passeFiltres, resoudreFiltre, type BilanPhotos, type CarteAccueil, type FiltreAccueil, type Generation } from "@/lib/studioCases";

// ── Catalogue: one action sentence per colourway ────────────────────────────

/** What a colourway is waiting for, in work order. */
export type GenreAction = "photographier" | "retoucher" | "rien";

export type ActionCarte = {
  genre: GenreAction;
  /** Verb first, what the click leads to: « Photographier le sac ». */
  phrase: string;
  /** Why, in a few words: « 9 / 15 prises ». */
  detail: string;
};

/** The fields of a catalogue card the action depends on (CarteColoris satisfies it). */
export type CarteAction = {
  chezMoi: number | null;
  prises: number;
  /** Photos gardées en dehors du tableau (facultatif : absent = aucune). */
  photos?: number;
  prochain: string | null;
};

const prises = (n: number) => `${n} / ${MAX_PRISES} prises`;

/**
 * The next thing to do on a colourway, in work order: photograph a bag that
 * has no photo, retouch the photos into a version for the next bag, or nothing.
 */
export function actionCarte(c: CarteAction): ActionCarte {
  const chezMoi = c.chezMoi ?? 0;
  if (c.prises === 0) {
    if (chezMoi > 0) {
      const gardees = c.photos ?? 0;
      return {
        genre: "photographier",
        phrase: "Photographier le sac",
        detail: `${prises(0)} · ${chezMoi} chez toi${gardees > 0 ? ` · ${pluriel(gardees, "photo gardée", "photos gardées")} hors tableau` : ""}`,
      };
    }
    return { genre: "rien", phrase: "Rien à préparer", detail: c.chezMoi === null ? "hors catalogue SacBase" : "aucun sac chez toi" };
  }
  if (c.prochain) {
    return { genre: "retoucher", phrase: `Retoucher pour ${c.prochain}`, detail: prises(c.prises) };
  }
  return { genre: "rien", phrase: "Rien à préparer", detail: c.chezMoi === null ? "hors catalogue SacBase" : "chaque sac a déjà son annonce" };
}

/** What the card says about the purchases of a colourway: where its bags are, or that none was ever bought. */
export type CarteStock = {
  chezMoi: number | null;
  vendus: number | null;
  /** Bags SacBase knows for this colourway, sold or not; null = not in the catalogue. */
  nbSacs: number | null;
  /** Real photos already imported for it. */
  photos: number;
};

/**
 * « 2 chez toi · vendu ×1 », « 1 en vente ou en route », or « jamais acheté ».
 *
 * « Jamais acheté » was once printed for every colourway with no bag at home and
 * none sold, which also hid a bag for sale or in transit. A colourway only
 * qualifies if SacBase knows no bag of it AND no photo was ever imported for it:
 * a photo means a bag existed.
 */
export function libelleStock(c: CarteStock): string {
  if (c.chezMoi === null) return "hors catalogue SacBase";
  const chez = c.chezMoi;
  const vendus = c.vendus ?? 0;
  const ailleurs = Math.max(0, (c.nbSacs ?? 0) - chez - vendus);
  const parties = [
    chez > 0 ? `${chez} chez toi` : null,
    ailleurs > 0 ? `${ailleurs} en vente ou en route` : null,
    vendus > 0 ? `vendu ×${vendus}` : null,
  ].filter(Boolean);
  if (parties.length > 0) return parties.join(" · ");
  return c.photos > 0 ? "acheté · photos importées" : "jamais acheté";
}

/** Group order of the catalogue: what blocks first. */
export const ORDRE_GENRES: readonly GenreAction[] = ["photographier", "retoucher", "rien"];

export const TITRES_GENRES: Record<GenreAction, string> = {
  photographier: "À photographier",
  retoucher: "À retoucher",
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

/**
 * The « Sans vraies photos » list in two sections: the bag is at home (to
 * photograph) or not (to order). Each keeps the order it came in; the two
 * together are exactly the input.
 */
export function separerSansPhotos<C extends CarteAccueil>(cartes: readonly C[]): { chezToi: C[]; aCommander: C[] } {
  return {
    chezToi: cartes.filter((c) => passeFiltres(c, null, "a_photographier_chez_toi")),
    aCommander: cartes.filter((c) => passeFiltres(c, null, "a_commander")),
  };
}

/** The fields of a catalogue card that the home screen reads (CarteColoris satisfies it). */
export type CarteListe = CarteAccueil & CarteAction & { coloris: string; modele: string; cle: string };

export type SectionListe<C> = { id: string; titre: string; cartes: C[] };

export type ListeAccueil<C> = {
  /** The big number and its two tiles: the WHOLE catalogue, whatever the filters say. */
  bilan: BilanPhotos;
  /** Search match, to count the generation buttons. */
  duTexte: (c: C) => boolean;
  /** Cards of the chosen generation and search, before the filter (counts the filter chips). */
  deGeneration: C[];
  visibles: C[];
  /** The visible cards in sections: by action, or « chez toi / pas chez toi » under « Sans vraies photos ». */
  sections: SectionListe<C>[];
};

const sansAccents = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/**
 * What the home screen shows for the given filters. The `bilan` is computed on
 * every card: neither the generation, the filter nor the search moves it.
 */
export function listeAccueil<C extends CarteListe>(cartes: readonly C[], f: FiltresListe): ListeAccueil<C> {
  const q = sansAccents(f.q.trim());
  const duTexte = (c: C) => !q || sansAccents(`${c.coloris} ${c.modele} ${c.cle}`).includes(q);
  const deGeneration = cartes.filter((c) => passeFiltres(c, f.generation, null) && duTexte(c));
  const visibles = deGeneration.filter((c) => passeFiltres(c, null, f.filtre));
  let sections: SectionListe<C>[];
  if (f.filtre === "jamais_photographies") {
    const { chezToi, aCommander } = separerSansPhotos(visibles);
    sections = [
      { id: "chez-toi", titre: "Chez toi : à photographier", cartes: chezToi },
      { id: "a-commander", titre: "Pas chez toi : à commander", cartes: aCommander },
    ].filter((x) => x.cartes.length > 0);
  } else {
    sections = regrouperParAction(visibles).map((g) => ({ id: g.genre, titre: TITRES_GENRES[g.genre], cartes: g.cartes }));
  }
  return { bilan: bilanPhotos(cartes), duTexte, deGeneration, visibles, sections };
}

// ── Catalogue: filters in the URL ───────────────────────────────────────────

/** Les filtres des cartes du catalogue : la vue « chez toi » (`etat`) ne les touche pas, et eux ne la touchent pas. */
export type FiltresListe = { generation: Generation | null; filtre: FiltreAccueil | null; q: string };

export type FiltresCatalogue = FiltresListe & {
  /** Vue « chez toi » : ne garde que les sacs de cet état (`?etat=a_photographier`) ; null = tous. */
  etat: EtatSac | null;
};

/** sessionStorage key of the catalogue query: « Tous les coloris » on a sheet goes back to it. */
export const CLE_RETOUR_CATALOGUE = "myflip-studio-catalogue";

export const FILTRES_VIDES: FiltresCatalogue = { generation: null, filtre: null, q: "", etat: null };

/**
 * Reads `?generation=V2&filtre=photographies&q=…&etat=pret`; an unknown value is ignored, never trusted.
 * The old `filtre=a_photographier` still reads, as `a_photographier_chez_toi`; the old
 * `etat=a_generer` as `a_retoucher` (`lireEtatSac`). The old `filtre=a_juger` (AI images to judge,
 * removed on 17/11) is ignored. `generation` is the bag generation (V1, V2, V3), not AI.
 */
export function lireFiltres(params: { get(nom: string): string | null }): FiltresCatalogue {
  const generation = params.get("generation");
  const filtre = params.get("filtre");
  const etat = params.get("etat");
  return {
    generation: estGeneration(generation) ? generation : null,
    filtre: resoudreFiltre(filtre),
    q: (params.get("q") ?? "").slice(0, 80),
    etat: lireEtatSac(etat),
  };
}

/** The query string of the filters, without the leading « ? » ; empty when nothing is filtered. */
export function ecrireFiltres(f: FiltresCatalogue): string {
  const p = new URLSearchParams();
  if (f.generation) p.set("generation", f.generation);
  if (f.filtre) p.set("filtre", f.filtre);
  const q = f.q.trim();
  if (q) p.set("q", q);
  if (f.etat) p.set("etat", f.etat);
  return p.toString();
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
