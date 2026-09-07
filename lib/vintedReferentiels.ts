// Tables de correspondance MyFlip → Vinted. Aucune logique métier : ce sont
// des relevés, recopiés depuis docs/audits/2026-09-07-vinted-form-mapping.md
// et son complément Nike. Toute divergence se tranche en faveur des audits.

export type CouleurVinted = {
  id: number;
  libelle: string;
  /** Vide pour « Multicolore », qui n'a pas de hex chez Vinted. */
  hex: string;
};

/** GET /api/v2/item_upload/colors — liste globale, indépendante de la catégorie.
 *  Conservée dans l'ordre `order` de Vinted : c'est celui du panneau réel. */
export const COULEURS_VINTED: CouleurVinted[] = [
  { id: 1, libelle: "Noir", hex: "#000000" },
  { id: 3, libelle: "Gris", hex: "#919191" },
  { id: 12, libelle: "Blanc", hex: "#FFFFFF" },
  { id: 20, libelle: "Crème", hex: "#F8F8E1" },
  { id: 4, libelle: "Beige", hex: "#F4E0C8" },
  { id: 21, libelle: "Abricot", hex: "#FFCC98" },
  { id: 11, libelle: "Orange", hex: "#FFA500" },
  { id: 22, libelle: "Corail", hex: "#FE7F5D" },
  { id: 7, libelle: "Rouge", hex: "#CC3300" },
  { id: 23, libelle: "Bordeaux", hex: "#AE2E3D" },
  { id: 5, libelle: "Fuchsia", hex: "#FF0080" },
  { id: 24, libelle: "Rose", hex: "#FFCCCA" },
  { id: 6, libelle: "Violet", hex: "#800080" },
  { id: 25, libelle: "Lila", hex: "#D297D2" },
  { id: 26, libelle: "Bleu clair", hex: "#89CFF0" },
  { id: 9, libelle: "Bleu", hex: "#007BC4" },
  { id: 27, libelle: "Marine", hex: "#35358D" },
  { id: 17, libelle: "Turquoise", hex: "#B7DEE8" },
  { id: 30, libelle: "Menthe", hex: "#A2FFBC" },
  { id: 10, libelle: "Vert", hex: "#369A3D" },
  { id: 28, libelle: "Vert foncé", hex: "#356639" },
  { id: 16, libelle: "Kaki", hex: "#86814A" },
  { id: 2, libelle: "Marron", hex: "#663300" },
  { id: 29, libelle: "Moutarde", hex: "#E5B539" },
  { id: 8, libelle: "Jaune", hex: "#FFF200" },
  { id: 13, libelle: "Argenté", hex: "#DDDDDD" },
  { id: 14, libelle: "Doré", hex: "#BE9927" },
  { id: 15, libelle: "Multicolore", hex: "" },
  { id: 32, libelle: "Transparence", hex: "#F8FDFD" },
];

/**
 * Les cinq libellés de `ETATS` (lib/listingOptions.ts) sont identiques au
 * caractère près aux cinq options de l'attribut `condition` de Vinted. C'est
 * ce qui permet de DÉRIVER `condition_id` du QCM au lieu de le figer.
 *
 * ⚠️ Si un libellé de `ETATS` change, cette table cesse de le couvrir et le
 * test `lib/vintedReferentiels.test.ts` échoue — c'est voulu.
 */
export const ETAT_VERS_CONDITION_ID: Record<string, number> = {
  "Neuf avec étiquette": 6,
  "Neuf sans étiquette": 1,
  "Très bon état": 2,
  "Bon état": 3,
  Satisfaisant: 4,
};

export function conditionIdDepuisEtat(etat: string): number | null {
  return ETAT_VERS_CONDITION_ID[etat] ?? null;
}

/** Les dix suggestions de `MATIERES_SUGGESTIONS` → attribut `material` Vinted.
 *  « Coton piqué » n'existe pas chez Vinted : il retombe sur Coton (44). */
export const MATIERE_VERS_MATERIAL_ID: Record<string, number> = {
  Coton: 44,
  "Coton piqué": 44,
  Polyester: 45,
  Laine: 46,
  Lin: 146,
  Cuir: 43,
  "Jean / Denim": 303,
  Cachemire: 123,
  Nylon: 52,
  Viscose: 48,
};

/**
 * Matières MyFlip → ids Vinted, dédupliqués et dans l'ordre de saisie.
 * Une matière vide ou absente de la table est ignorée : mieux vaut un
 * matériau manquant qu'un id inventé.
 */
export function materialIdsDepuisMatieres(matieres: string[]): number[] {
  const ids: number[] = [];
  for (const m of matieres) {
    const id = MATIERE_VERS_MATERIAL_ID[m];
    if (id === undefined) continue;
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}
