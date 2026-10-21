/**
 * Comptes de test e2e. Ils n'existent QUE dans la base Postgres embarquée et
 * jetable de la suite Playwright (recréée à chaque lancement) : jamais sur Neon,
 * ni dev ni prod. D'où un mot de passe écrit ici, sans valeur hors de cette base.
 *
 * Ids fixes, en minuscules et chiffres : le JWT fige l'id à la connexion, et
 * lib/studioBlob.ts exige ^[a-z0-9]{8,64}$ pour les chemins du Blob.
 */
export const MOT_DE_PASSE_E2E = "E2e-S7N7uAR8ItJ7fvzEu6Bs";

export const COMPTES = {
  /** Compte riche : stock, commandes, ventes sur plusieurs mois, Studio complet. */
  demo: {
    id: "e2edemo00000000000000001",
    email: "e2e-demo@myflip.test",
    prenom: "Jules",
    plan: "atelier",
  },
  /** Compte neuf : aucun réglage, seul le prompt par défaut ; montre les états vides. */
  neuf: {
    id: "e2eneuf00000000000000001",
    email: "e2e-neuf@myflip.test",
    prenom: "Camille",
    plan: "solo",
  },
} as const;

export type CleCompte = keyof typeof COMPTES;
