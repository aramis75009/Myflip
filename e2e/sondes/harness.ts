/**
 * Cadre commun des sondes : une sonde est une fonction qui MESURE dans la page
 * et rend des valeurs brutes plus un verdict (« corrigé » ou non). Le cadre :
 *
 *  - n'exécute la sonde que dans les projets prévus par l'étude ;
 *  - range chaque résultat dans e2e/rapports/<serie>/sondes.json
 *    (e2e/sondes/resultats.ts) avec sa capture ciblée ;
 *  - en mode normal, n'échoue PAS sur un bug présent (on documente l'avant) ;
 *    une sonde qui plante est consignée « non mesurable » avec son erreur ;
 *  - avec SONDES_STRICT=1, échoue dès qu'un état n'est pas « corrigé » : c'est ce
 *    mode que la refonte devra faire passer au vert.
 */
import type { Page } from "@playwright/test";

import { capturerSonde, type CibleCapture } from "./capture";
import { enregistrerSonde, type EtatSonde, type ResultatSonde } from "./resultats";
import { expect, test } from "./test";

export type NomProjet = "desktop-clair" | "desktop-sombre" | "mobile-clair" | "mobile-sombre";

export const DESKTOP: readonly NomProjet[] = ["desktop-clair", "desktop-sombre"];
export const MOBILE: readonly NomProjet[] = ["mobile-clair", "mobile-sombre"];
export const TOUS: readonly NomProjet[] = [...DESKTOP, ...MOBILE];
export const DESKTOP_CLAIR: readonly NomProjet[] = ["desktop-clair"];
export const MOBILE_CLAIR: readonly NomProjet[] = ["mobile-clair"];

/** Compte sous lequel la sonde s'exécute. */
export type CompteSonde = "aucun" | "demo" | "neuf" | "sonde";

export type ContexteSonde = {
  projet: NomProjet;
  sombre: boolean;
  mobile: boolean;
  /** Capture ciblée (élément, rectangle ou fenêtre) rangée avec les autres captures de la série. */
  capturer: (cible?: CibleCapture, suffixe?: string, marge?: number) => Promise<string | null>;
};

export type MesureSonde = {
  /** Sous-sonde : remplace l'identifiant, le titre et le critère de la sonde (sondes globales G1 à G6). */
  id?: string;
  titre?: string;
  critere?: string;
  /** Route ou état mesuré, si différent de celui de la sonde (« /parametres, modale Nouveau prompt »). */
  route?: string;
  /** Entrée du catalogue de routes mesurée (`route.<id>`, `route.neuf.<id>`), pour les sondes qui parcourent le catalogue. */
  variante?: string;
  mesure: Record<string, unknown>;
  /** true = corrigé, false = bug présent, null = non mesurable. */
  corrige: boolean | null;
  capture?: string | null;
};

export type Sonde = {
  /** Identifiant du bug (F1, O2, S3, X7…) ou de la sonde globale (G1…). */
  id: string;
  titre: string;
  /** Route par défaut, pour le rapport. */
  route: string;
  /** Ce qui doit être vrai une fois corrigé. */
  critere: string;
  projets: readonly NomProjet[];
  compte: CompteSonde;
  /** Délai du test en ms (défaut 180 s : `next dev` compile chaque route à sa première visite). */
  delaiMs?: number;
  executer: (page: Page, ctx: ContexteSonde) => Promise<MesureSonde | MesureSonde[]>;
};

export const STRICT = process.env.SONDES_STRICT === "1";

/**
 * Une étape d'une sonde qui parcourt plusieurs routes ou états : si elle plante (état introuvable, délai dépassé),
 * seule CETTE étape est consignée « non mesurable » avec son erreur ; les autres routes sont mesurées quand même.
 */
export async function etape(route: string, mesurer: () => Promise<MesureSonde | MesureSonde[]>, variante?: string): Promise<MesureSonde[]> {
  try {
    const sortie = await mesurer();
    return Array.isArray(sortie) ? sortie : [sortie];
  } catch (e) {
    const message = e instanceof Error ? e.message.split("\n").slice(0, 4).join(" | ") : "erreur inconnue";
    test.info().annotations.push({ type: "étape plantée", description: `${route} : ${message}` });
    return [{ route, variante, mesure: { erreur: message }, corrige: null }];
  }
}

const etatDe = (corrige: boolean | null): EtatSonde => (corrige === null ? "non mesurable" : corrige ? "corrigé" : "bug présent");

export type Sortie = Pick<ResultatSonde, "id" | "titre" | "projet" | "route" | "variante" | "mesure" | "critere" | "etat" | "capture">;

/** Exécute une sonde et range ses résultats. Rend les états, pour le mode strict. */
export async function lancerSonde(page: Page, sonde: Sonde, projet: NomProjet): Promise<Sortie[]> {
  const ctx: ContexteSonde = {
    projet,
    sombre: projet.endsWith("sombre"),
    mobile: projet.startsWith("mobile"),
    capturer: (cible, suffixe, marge) => capturerSonde(page, sonde.id, suffixe ?? null, cible, marge),
  };

  let mesures: MesureSonde[];
  try {
    const sortie = await sonde.executer(page, ctx);
    mesures = Array.isArray(sortie) ? sortie : [sortie];
  } catch (e) {
    const message = e instanceof Error ? e.message.split("\n").slice(0, 6).join(" | ") : "erreur inconnue";
    test.info().annotations.push({ type: "sonde plantée", description: `${sonde.id} : ${message}` });
    mesures = [{ mesure: { erreur: message }, corrige: null }];
  }

  const sorties: Sortie[] = [];
  for (const m of mesures) {
    const s: Sortie = {
      id: m.id ?? sonde.id,
      titre: m.titre ?? sonde.titre,
      projet,
      route: m.route ?? sonde.route,
      variante: m.variante ?? null,
      mesure: m.mesure,
      critere: m.critere ?? sonde.critere,
      etat: etatDe(m.corrige),
      capture: m.capture ?? null,
    };
    await enregistrerSonde(s);
    sorties.push(s);
  }
  return sorties;
}

/** Déclare les tests d'une liste de sondes, regroupés par compte et par projets. */
export function declarerSondes(sondes: readonly Sonde[], titre: string): void {
  const groupes = new Map<string, Sonde[]>();
  for (const s of sondes) {
    const cle = `${s.compte}|${s.projets.join(",")}`;
    groupes.set(cle, [...(groupes.get(cle) ?? []), s]);
  }

  for (const liste of groupes.values()) {
    const { compte, projets } = liste[0];
    test.describe(`${titre} · compte ${compte} · ${projets.join(", ")}`, () => {
      if (compte === "sonde") test.use({ identite: "sonde", compte: "aucun", projetsAutorises: [...projets] });
      else test.use({ identite: "defaut", compte, projetsAutorises: [...projets] });

      for (const sonde of liste) {
        test(`${sonde.id} · ${sonde.titre} · ${sonde.route}`, async ({ page }) => {
          const projet = test.info().project.name as NomProjet;
          test.setTimeout(sonde.delaiMs ?? 180_000);

          const sorties = await lancerSonde(page, sonde, projet);
          for (const s of sorties) {
            test.info().annotations.push({ type: `sonde ${s.id}`, description: `${s.etat} · ${s.route}${s.variante ? ` [${s.variante}]` : ""}` });
          }
          if (STRICT) {
            // `soft` : toutes les sous-sondes d'un test (G1 à G7 d'une route) sont rapportées, pas seulement la première.
            for (const s of sorties) expect.soft(s.etat, `${s.id} (${s.route}) : ${s.critere}`).toBe("corrigé");
          }
        });
      }
    });
  }
}
