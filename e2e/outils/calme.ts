/**
 * Calme réseau RÉARMABLE : « la page a fini de charger ses données ».
 *
 * Pourquoi pas `page.waitForLoadState("networkidle")` : cet état est COLLANT.
 * Playwright le déclare une fois par document, au premier silence de 500 ms,
 * puis répond tout de suite à chaque appel suivant, même si de nouvelles
 * requêtes sont en cours. Sous `next dev` (compilation à la demande, machine
 * chargée), ce premier silence tombe souvent AVANT que React ait hydraté et
 * lancé ses requêtes de données : une capture prise ensuite montre « Chargement
 * du catalogue… », un avatar « · » au lieu de l'initiale, une colonne
 * « Rentabilité » vide. Constaté sur deux lancements identiques de la série
 * « avant » : 72 captures différaient pour cette raison.
 *
 * Ici, chaque requête du contexte (tous onglets) est suivie. La page est calme
 * quand aucune requête n'est en cours depuis `calmeMs`, ET que son fil
 * principal s'est libéré (hydratation, rendu) sans qu'une nouvelle requête soit
 * partie entre-temps (les effets lancés par l'hydratation). Un test qui retient
 * volontairement une requête (`retenir`, reseau-simule.ts) la signale à
 * `ignorerRequete` : une requête retenue exprès n'est pas de l'activité.
 *
 * L'hydratation de React se fait par tranches de 5 ms : un aller-retour dans la
 * page peut tomber entre deux tranches, avant que les effets aient lancé les
 * requêtes. Signal positif en plus : sur toute page à barre du haut, l'avatar
 * (`button[aria-label^="Mon compte"]`) porte le prénom (« Mon compte (Jules) »)
 * une fois la page hydratée ET la session reçue ; tant qu'il manque, la page
 * n'est pas prête. Les requêtes de données de l'hydratation sont alors parties.
 *
 * Le suivi est branché par la fixture `context` de e2e/outils/test.ts : un spec
 * qui importerait `test` de @playwright/test n'aurait pas de calme (l'appel lève).
 */
import type { BrowserContext, Page, Request } from "@playwright/test";

type Suivi = {
  enCours: Set<Request>;
  ignorees: WeakSet<Request>;
  /** Incrémenté à chaque requête qui part : sert à voir si quelque chose a démarré entre deux relevés. */
  departs: number;
  ecouteurs: Set<() => void>;
};

const SUIVIS = new WeakMap<BrowserContext, Suivi>();

/** Flux longs ou sans effet sur l'affichage : jamais comptés. */
const TYPES_IGNORES = new Set(["websocket", "eventsource", "ping"]);

/**
 * Mises à jour à chaud de `next dev` (`/_next/static/webpack/<hash>.hot-update.js`, `/__nextjs_*`) :
 * le serveur les émet quand il recompile, pas la page pour ses données. Une recompilation lente
 * laissait un tel GET en cours et bloquait le calme (constaté sous latence, jusqu'à 60 s).
 */
const OUTILS_DEV = /(\.hot-update\.(js|json)$|^\/_next\/webpack-hmr|^\/__nextjs)/;

const ignoree = (r: Request): boolean => TYPES_IGNORES.has(r.resourceType()) || OUTILS_DEV.test(new URL(r.url()).pathname);

/** Onglet d'une requête (indéfini pour une requête de service worker, qui n'a pas de frame). */
function pageDe(r: Request): Page | undefined {
  try {
    return r.frame().page();
  } catch {
    return undefined;
  }
}

/** null pour une requête du cadre principal ; une valeur pour celle d'un iframe. */
function enfantDe(r: Request): unknown {
  try {
    return r.frame().parentFrame();
  } catch {
    return undefined;
  }
}

export function suivreReseau(context: BrowserContext): void {
  if (SUIVIS.has(context)) return;
  const suivi: Suivi = { enCours: new Set(), ignorees: new WeakSet(), departs: 0, ecouteurs: new Set() };
  SUIVIS.set(context, suivi);
  const prevenir = () => suivi.ecouteurs.forEach((f) => f());
  context.on("request", (r) => {
    // Nouveau document dans l'onglet (chargement, rechargement, lien) : les requêtes de l'ancien document
    // sont abandonnées, et celles qu'une route (latence, retenue) tenait encore ne signalent parfois
    // ni `requestfinished` ni `requestfailed` : sans ce nettoyage elles bloqueraient le calme à jamais.
    if (r.isNavigationRequest() && enfantDe(r) === null) {
      const page = pageDe(r);
      for (const ancienne of suivi.enCours) if (pageDe(ancienne) === page) suivi.enCours.delete(ancienne);
    }
    if (ignoree(r) || suivi.ignorees.has(r)) return;
    suivi.enCours.add(r);
    suivi.departs += 1;
    prevenir();
  });
  const fini = (r: Request) => {
    if (suivi.enCours.delete(r)) prevenir();
  };
  context.on("requestfinished", fini);
  context.on("requestfailed", fini);
}

/** Une requête retenue exprès par le test n'empêche plus le calme. */
export function ignorerRequete(page: Page, requete: Request): void {
  const suivi = SUIVIS.get(page.context());
  if (!suivi) return;
  suivi.ignorees.add(requete);
  if (suivi.enCours.delete(requete)) suivi.ecouteurs.forEach((f) => f());
}

/** La requête retenue est relâchée : elle compte de nouveau (elle finira par `requestfinished`/`requestfailed`). */
export function reprendreRequete(page: Page, requete: Request): void {
  const suivi = SUIVIS.get(page.context());
  if (!suivi || !suivi.ignorees.has(requete)) return;
  suivi.ignorees.delete(requete);
  suivi.enCours.add(requete);
  suivi.departs += 1;
  suivi.ecouteurs.forEach((f) => f());
}

/** URLs des requêtes encore en cours, pour un message d'erreur qui dit ce qui bloque. */
export function requetesEnCours(page: Page): string[] {
  const suivi = SUIVIS.get(page.context());
  return suivi ? [...suivi.enCours].map((r) => `${r.method()} ${new URL(r.url()).pathname}`) : [];
}

export type OptionsCalme = {
  /** Durée sans requête en cours qui vaut « calme » (défaut 700 ms). */
  calmeMs?: number;
  /** Plafond de l'attente (défaut 60 s : un Mac qui swappe fige `next dev` 40 s). Au-delà : faux, l'appelant échoue. */
  plafondMs?: number;
  /**
   * Exiger que l'avatar de la barre du haut porte le prénom (défaut vrai). Faux pour un état dont la
   * session est volontairement absente ou simulée en erreur : l'avatar resterait « Mon compte » sans prénom.
   */
  identite?: boolean;
};

/** Résolue vraie après `calmeMs` sans requête en cours ; fausse au plafond. */
function silence(suivi: Suivi, calmeMs: number, plafondMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let calme: ReturnType<typeof setTimeout> | undefined;
    const verifier = () => {
      if (calme) clearTimeout(calme);
      calme = suivi.enCours.size === 0 ? setTimeout(() => terminer(true), calmeMs) : undefined;
    };
    const plafond = setTimeout(() => terminer(false), plafondMs);
    const terminer = (calmeAtteint: boolean) => {
      if (calme) clearTimeout(calme);
      clearTimeout(plafond);
      suivi.ecouteurs.delete(verifier);
      resolve(calmeAtteint);
    };
    suivi.ecouteurs.add(verifier);
    verifier();
  });
}

const EST_TIMEOUT = (e: unknown): boolean => e instanceof Error && e.name === "TimeoutError";

/**
 * Attend le calme réseau de la page. Vrai : calme atteint. Faux : plafond
 * dépassé (un flux qui ne finit pas, un serveur figé) : l'appelant ÉCHOUE
 * (`requetesEnCours` dit ce qui bloque). Photographier quand même donnerait
 * une référence « avant » à moitié chargée, différente d'un lancement à l'autre.
 */
export async function attendreCalme(page: Page, options: OptionsCalme = {}): Promise<boolean> {
  const suivi = SUIVIS.get(page.context());
  if (!suivi) throw new Error("Calme réseau non branché : importer `test` de e2e/outils/test.ts, pas de @playwright/test.");
  const calmeMs = options.calmeMs ?? 700;
  const exigerIdentite = options.identite ?? true;
  const fin = Date.now() + (options.plafondMs ?? 60_000);
  for (;;) {
    const restant = fin - Date.now();
    if (restant <= 0) return false;
    try {
      if (exigerIdentite) {
        // Sans barre du haut (login, landing, légales) il n'y a pas d'avatar : rien à attendre.
        await page.waitForFunction(
          () => {
            const avatar = document.querySelector('button[aria-label^="Mon compte"]');
            return !avatar || /^Mon compte \(/.test(avatar.getAttribute("aria-label") ?? "");
          },
          undefined,
          { timeout: restant },
        );
      }
    } catch (e) {
      if (EST_TIMEOUT(e)) return false;
      continue; // navigation en cours : le document a changé, on remesure
    }
    if (!(await silence(suivi, calmeMs, Math.max(1, fin - Date.now())))) return false;
    // Le fil principal peut être occupé (hydratation d'une grosse page) : l'aller-retour ne revient
    // qu'une fois rendu et effets passés. Si une requête est partie entre-temps, on recommence.
    const departs = suivi.departs;
    try {
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0))));
    } catch {
      continue;
    }
    if (suivi.departs === departs && suivi.enCours.size === 0) return true;
  }
}
