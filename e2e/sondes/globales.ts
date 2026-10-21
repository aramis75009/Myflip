/**
 * Sondes GLOBALES : les mêmes relevés sur chaque route du catalogue
 * (e2e/sondes/routes.ts), dans les 4 projets, compte `demo` (pages publiques :
 * sans session). Une visite par route et par projet donne sept résultats (G6 : mobile seulement) :
 *
 *  G1  texte sous 10 px et sous 11 px                         (PRD § 3-2 : aucun texte sous 11 px)
 *  G2  nombre de tailles de texte distinctes                  (PRD § 3-2 : 8 tailles au plus)
 *  G3  part des textes qui suivent la taille racine           (PRD § 3-2 : tailles en rem, zoom texte)
 *  G4  débordement horizontal, éléments en hauteur pleine     (PRD § 3-5 ; bug M2)
 *  G5  éléments fixed/sticky, z-index, jetons --z-*           (PRD § 3-2 : échelle de z-index nommée ; bug M3)
 *  G6  champs de saisie sous 16 px à 390 px (mobile seulement) (PRD § 3-5 ; bug MO1)
 *  G7  classes d'opacité Tailwind sans règle CSS               (bugs O1 à O3 : balayage valable sur toute route)
 */
import { arrondi } from "./couleurs";
import { type MesureSonde, type Sonde, TOUS } from "./harness";
import { classesOpaciteMortes } from "./bugs-opacites";
import { releveChamps, releveDebordements, releveFixes, relevePolices, releveZoomTexte } from "./mesures";
import { aller } from "./pages";
import { etiquette, ROUTES_SONDES, type RouteSonde } from "./routes";

const CRITERES = {
  G1: "Aucun texte d'interface visible sous 11 px : lt11 = 0 (donc lt10 = 0) sur chaque route et chaque viewport.",
  G2: "Une échelle typographique de 8 tailles distinctes au plus par route (nbTailles <= 8).",
  G3: "Les tailles suivent la taille racine (rem) : ratio >= 0,95 quand la taille racine passe de 16 à 32 px ; exceptions (icônes, SVG) documentées.",
  G4: "Aucun défilement horizontal (debordH <= 0) et aucun défilement vertical parasite : la page ne défile pas (debordV > 0) alors qu'il reste plus de 150 px vides sous son dernier contenu (videEnBas).",
  G5: "Chaque z-index d'élément fixed/sticky est la valeur d'un jeton nommé (--z-* sur :root) et deux éléments visibles qui se chevauchent n'ont jamais le même z-index.",
  G6: "Aucun champ de saisie sous 16 px à 390 px (iOS ne zoome plus au focus) : minimum >= 16.",
  G7: "Aucune classe d'opacité (bg-…/NN, text-…/NN, border-…/NN, ring-…/NN) sans règle CSS générée : liste vide.",
} as const;

/** Au-delà, l'espace vide sous le contenu d'une page qui défile n'est plus du simple padding (pb-24 du dock mobile = 96 px, marges ~ 14 px). */
const SEUIL_VIDE_PARASITE = 150;

const TITRES = {
  G1: "Texte sous 10 px et 11 px",
  G2: "Tailles de texte distinctes",
  G3: "Texte qui suit la taille racine (zoom)",
  G4: "Débordements horizontal et plein écran",
  G5: "Éléments fixes, z-index et jetons",
  G6: "Champs sous 16 px (390 px)",
  G7: "Classes d'opacité sans effet",
} as const;

function sondeRoute(r: RouteSonde): Sonde {
  return {
    id: "G",
    titre: "Sondes globales",
    route: etiquette(r),
    critere: "voir chaque sous-sonde G1 à G7",
    projets: TOUS,
    compte: r.compte,
    delaiMs: 240_000,
    executer: async (page, ctx) => {
      if (r.entree.mouvementReduit) await page.emulateMedia({ reducedMotion: "reduce" });
      const { statut, url } = await aller(page, r.chemin, { attente: r.entree.attente(page) });
      const base = {
        urlFinale: url,
        statut,
        statutAttendu: r.entree.statut,
        compte: r.compte,
        ...(ctx.mobile && r.entree.informatifMobile ? { informatifMobile: r.entree.informatifMobile } : {}),
      };
      const capture = await ctx.capturer(undefined, r.variante.replace(/^route\./, ""));

      const polices = await page.evaluate(relevePolices);
      const debord = await page.evaluate(releveDebordements);
      const fixes = await page.evaluate(releveFixes);
      const champs = ctx.mobile ? await page.evaluate(releveChamps) : null;
      const opacitesMortes = await classesOpaciteMortes(page);
      // En dernier : change la taille racine le temps de la mesure.
      const zoom = await page.evaluate(releveZoomTexte);

      const sorties: MesureSonde[] = [
        {
          id: "G1",
          route: r.chemin,
          variante: r.variante,
          titre: TITRES.G1,
          critere: CRITERES.G1,
          mesure: { ...base, lt10: polices.lt10, lt11: polices.lt11, textesVisibles: polices.total, exemples: polices.exemples },
          corrige: polices.lt11 === 0,
          capture,
        },
        {
          id: "G2",
          route: r.chemin,
          variante: r.variante,
          titre: TITRES.G2,
          critere: CRITERES.G2,
          mesure: { ...base, nbTailles: polices.nbTailles, tailles: polices.tailles },
          corrige: polices.nbTailles <= 8,
        },
        {
          id: "G3",
          route: r.chemin,
          variante: r.variante,
          titre: TITRES.G3,
          critere: CRITERES.G3,
          mesure: { ...base, total: zoom.total, suivent: zoom.suivent, ratio: zoom.ratio, exceptions: zoom.exceptions },
          corrige: zoom.ratio >= 0.95,
        },
        {
          id: "G4",
          route: r.chemin,
          variante: r.variante,
          titre: TITRES.G4,
          critere: CRITERES.G4,
          mesure: { ...base, ...debord },
          corrige: debord.debordH <= 0 && !(debord.debordV > 0 && debord.videEnBas > SEUIL_VIDE_PARASITE),
        },
        {
          id: "G5",
          route: r.chemin,
          variante: r.variante,
          titre: TITRES.G5,
          critere: CRITERES.G5,
          mesure: {
            ...base,
            elements: fixes.elements,
            jetons: fixes.jetons,
            sansJeton: fixes.sansJeton,
            memeZ: fixes.memeZ,
          },
          corrige: Object.keys(fixes.jetons).length > 0 && fixes.sansJeton.length === 0 && fixes.memeZ.length === 0,
        },
      ];
      sorties.push({
        id: "G7",
        route: r.chemin,
        variante: r.variante,
        titre: TITRES.G7,
        critere: CRITERES.G7,
        mesure: { ...base, classesSansRegle: opacitesMortes },
        corrige: opacitesMortes.length === 0,
      });
      if (champs) {
        const sous16 = champs.filter((c) => c.taille < 16);
        sorties.push({
          id: "G6",
          route: r.chemin,
          variante: r.variante,
          titre: TITRES.G6,
          critere: CRITERES.G6,
          mesure: {
            ...base,
            champs: champs.length,
            minimum: champs.length ? arrondi(Math.min(...champs.map((c) => c.taille))) : null,
            sous16: sous16.length,
            exemples: sous16.slice(0, 8),
          },
          corrige: sous16.length === 0,
        });
      }
      return sorties;
    },
  };
}

export const SONDES_GLOBALES: readonly Sonde[] = ROUTES_SONDES.map(sondeRoute);
