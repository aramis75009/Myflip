/**
 * Environnement de la suite e2e : ports, dossiers, variables du serveur de
 * test et contrôles de préparation. Seule source de ces valeurs : la config
 * Playwright, le globalSetup/teardown et les fixtures l'importent.
 *
 * Décalage (E2E_DECALAGE, défaut 0) : il décale TOUS les ports et les dossiers
 * pour que deux suites tournent en même temps. Il doit être un multiple de 10 :
 * les faux serveurs sont à 4010+D et 4011+D, donc deux décalages voisins (0 et
 * 1) se marcheraient dessus (4011).
 *
 * Aucune valeur réelle ici : tout ce qui ressemble à un secret est factice et
 * ne vaut que pour la base Postgres embarquée, jetable, de la suite.
 */
import fs from "node:fs";
import path from "node:path";

export const RACINE = path.resolve(__dirname, "..", "..");

function lireDecalage(): number {
  const brut = process.env.E2E_DECALAGE?.trim() || "0";
  const d = Number(brut);
  if (!Number.isInteger(d) || d < 0 || d > 990 || d % 10 !== 0) {
    throw new Error(
      `E2E_DECALAGE invalide (« ${brut} ») : un multiple de 10 entre 0 et 990. ` +
        "Les faux serveurs sont à 4010+D et 4011+D : deux décalages voisins partageraient un port.",
    );
  }
  return d;
}

export const DECALAGE = lireDecalage();
/** "" pour le décalage 0, "-d10" pour 10 : suffixe des dossiers propres à une suite. */
export const SUFFIXE = DECALAGE === 0 ? "" : `-d${DECALAGE}`;

export const PORTS = {
  app: 3100 + DECALAGE,
  openrouter: 4010 + DECALAGE,
  sacbase: 4011 + DECALAGE,
  resend: 4014 + DECALAGE,
  postgres: 5433 + DECALAGE,
} as const;

export const URL_APP = `http://localhost:${PORTS.app}`;
export const URL_OPENROUTER = `http://127.0.0.1:${PORTS.openrouter}/api/v1`;
export const URL_OPENROUTER_RACINE = `http://127.0.0.1:${PORTS.openrouter}`;
export const URL_SACBASE = `http://127.0.0.1:${PORTS.sacbase}`;
export const URL_RESEND = `http://127.0.0.1:${PORTS.resend}`;

/** Série de captures et de rapports : CAPTURES_SERIE, sinon « courant » (« courant-d10 » décalé). */
export const SERIE = (() => {
  const s = process.env.CAPTURES_SERIE?.trim() || `courant${SUFFIXE}`;
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(s)) throw new Error(`CAPTURES_SERIE invalide : « ${s} ».`);
  return s;
})();

export const DOSSIERS = {
  rapports: path.join(RACINE, "e2e", "rapports", SERIE),
  captures: path.join(RACINE, "e2e", "captures.nosync", SERIE),
  auth: path.join(RACINE, "e2e", ".auth", ...(DECALAGE === 0 ? [] : [`d${DECALAGE}`])),
  base: path.join(RACINE, ".e2e-db.nosync", String(DECALAGE)),
  /** Relatif à la racine : c'est ce que lit next.config.mjs. */
  distNext: `.next-e2e-${PORTS.app}.nosync`,
  resultats: path.join(RACINE, `test-results${SUFFIXE}`),
  rapportHtml: path.join(RACINE, `playwright-report${SUFFIXE}`),
} as const;

export const JOURNAUX = {
  reseauServeur: path.join(DOSSIERS.rapports, "reseau-serveur.jsonl"),
  reseauNavigateur: path.join(DOSSIERS.rapports, "reseau-navigateur.jsonl"),
  console: path.join(DOSSIERS.rapports, "console.jsonl"),
  mocks: path.join(DOSSIERS.rapports, "mocks.jsonl"),
  /** Une ligne par capture de route ou d'état (e2e/outils/rapport.ts). */
  captures: path.join(DOSSIERS.rapports, "captures.jsonl"),
} as const;

export const BASE = {
  nom: "myflip_e2e",
  utilisateur: "postgres",
  // Mot de passe factice d'un cluster jetable qui n'écoute que sur localhost.
  motDePasse: "postgres",
} as const;

export const DATABASE_URL_E2E =
  `postgresql://${BASE.utilisateur}:${BASE.motDePasse}@localhost:${PORTS.postgres}/${BASE.nom}?schema=public`;

/** Clé de chiffrement factice : le seed chiffre la clé OpenRouter factice du compte avec elle. */
export const ENCRYPTION_KEY_E2E = "e2e0".repeat(16);
export const SACBASE_JETON_E2E = "e2e-sacbase-jeton-factice";

/** Identifiant de ce lancement, partagé par les workers (ils héritent de process.env). */
export function idLancement(): string {
  return process.env.E2E_RUN_ID ?? "inconnu";
}

/**
 * Variables du `next dev` de test. Chaque nom présent dans .env / .env.local
 * DOIT figurer ici (contrôlé par `controlerPreparation`) : une variable déjà
 * dans process.env n'est jamais écrasée par les fichiers .env de Next, une
 * chaîne vide suffit donc à neutraliser un vrai secret.
 */
export function envServeur(): Record<string, string> {
  return {
    // ── Base, auth, chiffrement ──
    DATABASE_URL: DATABASE_URL_E2E,
    NEXTAUTH_URL: URL_APP,
    AUTH_URL: URL_APP,
    AUTH_TRUST_HOST: "true",
    AUTH_SECRET: "e2e-auth-secret-factice-ne-protege-rien-0000",
    NEXTAUTH_SECRET: "e2e-auth-secret-factice-ne-protege-rien-0000",
    ENCRYPTION_KEY: ENCRYPTION_KEY_E2E,
    INVITE_CODES: "E2E-INVITE",
    // ── Faux serveurs ──
    OPENROUTER_BASE_URL: URL_OPENROUTER,
    SACBASE_URL: URL_SACBASE,
    SACBASE_STUDIO_TOKEN: SACBASE_JETON_E2E,
    RESEND_BASE_URL: URL_RESEND,
    RESEND_API_KEY: "re_e2e_factice",
    // ── Blob « niveau 0 » : aucun jeton, le navigateur sert les images ──
    BLOB_READ_WRITE_TOKEN: "",
    VERCEL_OIDC_TOKEN: "",
    VERCEL_BLOB_API_URL: "",
    VERCEL_BLOB_RETRIES: "0",
    NEXT_PUBLIC_VERCEL_BLOB_API_URL: "",
    BLOB_STORE_ID: "",
    // ── À vider : de vraies valeurs vivent dans .env.local ──
    OPENROUTER_API_KEY: "",
    TRELLO_API_KEY: "",
    TRELLO_API_SECRET: "",
    TRELLO_TOKEN: "",
    TRELLO_SECRET: "",
    TRELLO_BOARD_ID: "",
    TRELLO_LABEL_ID: "",
    TRELLO_COMPTABILISE_LABEL_ID: "",
    TRELLO_OWNER_EMAIL: "",
    HERMES_API_TOKEN: "",
    HERMES_USER_EMAIL: "",
    SACBASE_API_TOKEN: "",
    SACBASE_USER_EMAIL: "",
    NEXT_PUBLIC_LANDING_HOST: "",
    NEXT_PUBLIC_APP_HOST: "",
    ANTHROPIC_API_KEY: "",
    GEMINI_API_KEY: "",
    DASHSCOPE_API_KEY: "",
    AUTH_EMAIL: "",
    AUTH_PASSWORD: "",
    NEXT_PUBLIC_USER_NAME: "",
    // ── Outillage ──
    E2E: "1",
    E2E_DECALAGE: String(DECALAGE),
    E2E_RUN_ID: idLancement(),
    E2E_JOURNAL_RESEAU: JOURNAUX.reseauServeur,
    NEXT_DIST_DIR: DOSSIERS.distNext,
    NEXT_TELEMETRY_DISABLED: "1",
    CHECKPOINT_DISABLE: "1",
    TZ: "Europe/Paris",
    // Chemin RELATIF (le dossier contient des espaces) : cwd = racine de l'app.
    NODE_OPTIONS: "--import=./e2e/garde-reseau.mjs",
  };
}

// ── Contrôles de préparation ────────────────────────────────────────────────

const HOTES_LOCAUX = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Vrai pour une URL http(s)/postgres dont l'hôte est une boucle locale. */
export function estUrlLocale(url: string): boolean {
  try {
    return HOTES_LOCAUX.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** Fichiers .env que `next dev` charge (les autres, .example, .prod.tmp…, il les ignore). */
const FICHIERS_ENV_NEXT = [".env", ".env.local", ".env.development", ".env.development.local"];

/** NOMS des variables d'un fichier .env. Les valeurs ne sont jamais lues hors de la ligne courante. */
export function nomsVariables(fichier: string): string[] {
  if (!fs.existsSync(fichier)) return [];
  const noms = new Set<string>();
  for (const ligne of fs.readFileSync(fichier, "utf8").split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(ligne);
    if (m) noms.add(m[1]);
  }
  return [...noms];
}

/**
 * Refuse de lancer la suite si le serveur de test pouvait atteindre une vraie
 * ressource : base non locale, faux serveur non local, ou une variable des
 * fichiers .env que l'environnement du serveur ne surcharge pas. Lève une
 * erreur qui liste les NOMS en cause, jamais les valeurs.
 */
export function controlerPreparation(env: Record<string, string> = envServeur()): void {
  const erreurs: string[] = [];

  const db = env.DATABASE_URL ?? "";
  if (!estUrlLocale(db)) erreurs.push("DATABASE_URL ne vise pas localhost.");
  if (/neon\.tech|ep-curly-haze|ep-autumn-morning/i.test(db)) erreurs.push("DATABASE_URL vise Neon.");
  for (const nom of ["OPENROUTER_BASE_URL", "SACBASE_URL", "RESEND_BASE_URL", "NEXTAUTH_URL", "AUTH_URL"]) {
    if (!estUrlLocale(env[nom] ?? "")) erreurs.push(`${nom} n'est pas une adresse locale.`);
  }
  if (env.VERCEL_BLOB_API_URL && !estUrlLocale(env.VERCEL_BLOB_API_URL)) {
    erreurs.push("VERCEL_BLOB_API_URL n'est pas une adresse locale.");
  }
  for (const nom of ["BLOB_READ_WRITE_TOKEN", "VERCEL_OIDC_TOKEN", "OPENROUTER_API_KEY"]) {
    if (env[nom] !== "") erreurs.push(`${nom} doit être vide (Blob niveau 0, aucune clé de repli).`);
  }

  const nonSurcharges: string[] = [];
  for (const f of FICHIERS_ENV_NEXT) {
    for (const nom of nomsVariables(path.join(RACINE, f))) {
      if (!(nom in env)) nonSurcharges.push(`${nom} (${f})`);
    }
  }
  if (nonSurcharges.length > 0) {
    erreurs.push(
      "Variables des fichiers .env NON surchargées dans l'env du serveur e2e (e2e/outils/environnement.ts) : " +
        nonSurcharges.join(", "),
    );
  }

  if (erreurs.length > 0) {
    throw new Error("[e2e] Préparation refusée :\n- " + erreurs.join("\n- "));
  }
}

/** Fichiers propres à un lancement, vidés au début de chaque `playwright test`. */
export function viderJournauxDuLancement(): void {
  fs.mkdirSync(DOSSIERS.rapports, { recursive: true });
  for (const f of Object.values(JOURNAUX)) fs.rmSync(f, { force: true });
}

/** Chemin du storageState d'un compte (e2e/.auth/<compte>.json, ou e2e/.auth/d10/… décalé). */
export function cheminEtatSession(compte: string): string {
  return path.join(DOSSIERS.auth, `${compte}.json`);
}

export const SEED = path.join(RACINE, "e2e", "seed", "seed-e2e.ts");
export const seedPresent = (): boolean => fs.existsSync(SEED);
