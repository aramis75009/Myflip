// La combinaison marque + catégorie MyFlip → les constantes Vinted de la
// catégorie visée. Une seule entrée aujourd'hui : sacs à dos Nike.
//
// Pas de cascade façon pickPrompt()/pickPrix() (marque seule, catégorie
// seule, défaut) : avec une entrée, ce serait du code mort qui ment sur son
// intention, et un défaut trop large rangerait n'importe quel article dans
// les sacs à dos. Le jour où une deuxième combinaison arrive, la cascade se
// rajoute AVEC ses tests.

export type MappingVinted = {
  /** Libellé MyFlip, tel qu'affiché en pastille. */
  marque: string;
  categorie: string;
  /** Feuille de l'arbre Vinted. 246 = Hommes > Accessoires > Sacs et sacoches. */
  categoryId: number;
  brandId: number;
  /** 1 = Petit, 2 = Moyen, 3 = Grand. */
  packageType: 1 | 2 | 3;
  unisex: boolean;
  /** Matières MyFlip pré-remplies quand le QCM est vide. */
  materiauxDefaut: string[];
  /** false ⇒ la catégorie Vinted n'a pas de champ taille. */
  aUneTaille: boolean;
  /** Texte à taper dans #catalog-search-input. */
  rechercheCategorie: string;
  /**
   * Fil d'Ariane attendu sur la ligne de résultat (.web_ui__Cell__body).
   *
   * ⚠️ Vérification indispensable : la recherche « Sacs à dos » renvoie
   * PLUSIEURS feuilles homonymes (246 Hommes, 157 Femmes, et l'équivalent
   * Enfants). Un id qui changerait chez Vinted rangerait les articles dans
   * le mauvais rayon sans la moindre erreur visible.
   *
   * Le rayon visé est HOMMES. Décision d'Aramis du 08/09/2026, qui corrige la
   * §6 de la spec : c'est 157/Femmes qui était l'erreur de relevé, pas 246.
   * Valeurs recopiées de docs/audits/2026-09-08-vinted-mecanique-panneaux.md §1,
   * le seul relevé qui ait créé un vrai brouillon — et il l'a créé sur 246.
   */
  filAriane: string;
};

export const MAPPINGS_VINTED: MappingVinted[] = [
  {
    marque: "Nike",
    categorie: "Sac à dos",
    categoryId: 246,
    brandId: 53,
    packageType: 1,
    unisex: true,
    materiauxDefaut: ["Polyester", "Nylon"],
    aUneTaille: false,
    rechercheCategorie: "Sacs à dos",
    filAriane: "Hommes > Accessoires > Sacs et sacoches",
  },
];

const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

/** Correspondance EXACTE sur marque + catégorie. Null si rien ne colle. */
export function pickVintedMapping(
  marque: string | null,
  categorie: string | null,
): MappingVinted | null {
  const m = norm(marque);
  const c = norm(categorie);
  if (!m || !c) return null;
  return (
    MAPPINGS_VINTED.find((x) => norm(x.marque) === m && norm(x.categorie) === c) ?? null
  );
}
