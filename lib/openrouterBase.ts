// Adresse de l'API OpenRouter, en un seul endroit.
//
// Les six modules qui appellent OpenRouter construisent leur URL ici. En
// production rien ne change : sans `OPENROUTER_BASE_URL`, c'est l'adresse
// publique. La variable n'existe que pour la suite e2e, qui la pointe vers un
// serveur factice local (e2e/mocks/openrouter.mjs) : aucun test n'appelle le
// vrai OpenRouter, ni ne dépense un centime.
//
// On n'accepte que le défaut ou une adresse LOCALE (http sur localhost,
// 127.0.0.1 ou [::1]), sur le modèle de `getSacbaseConfig`
// (lib/studioColoris.ts) : une variable mal posée en prod ne doit jamais
// pouvoir envoyer les clés des comptes vers un autre hôte. Ne JAMAIS la
// préfixer `NEXT_PUBLIC_` : elle n'a rien à faire dans le navigateur.
//
// Lecture À L'APPEL, pas au chargement du module : les tests restent sur le
// défaut et peuvent la poser avec `vi.stubEnv`.

export const OPENROUTER_BASE_URL_DEFAUT = "https://openrouter.ai/api/v1";

const LOCALE = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/.*)?$/;

export function baseOpenRouter(): string {
  const v = process.env.OPENROUTER_BASE_URL?.trim().replace(/\/+$/, "");
  if (!v) return OPENROUTER_BASE_URL_DEFAUT;
  if (v === OPENROUTER_BASE_URL_DEFAUT || LOCALE.test(v)) return v;
  console.error("[openrouter] OPENROUTER_BASE_URL ignorée : seule une adresse locale est acceptée.");
  return OPENROUTER_BASE_URL_DEFAUT;
}

/** `urlOpenRouter("/chat/completions")` → `<base>/chat/completions`. */
export const urlOpenRouter = (chemin: string): string =>
  baseOpenRouter() + (chemin.startsWith("/") ? chemin : "/" + chemin);
