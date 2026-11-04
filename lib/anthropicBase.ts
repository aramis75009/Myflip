// Adresse de l'API Anthropic, en un seul endroit.
//
// Même principe que `lib/ollamaBase.ts` et `lib/openrouterBase.ts` : en
// production rien ne change, sans `ANTHROPIC_BASE_URL` c'est l'adresse publique.
// La variable n'existe que pour la suite e2e, qui la pointe vers un serveur
// factice local : aucun test n'appelle la vraie API Anthropic.
//
// On n'accepte que le défaut ou une adresse LOCALE (http sur localhost,
// 127.0.0.1 ou [::1]) : une variable mal posée en prod ne doit jamais pouvoir
// envoyer les clés des comptes vers un autre hôte. Ne JAMAIS la préfixer
// `NEXT_PUBLIC_` : elle n'a rien à faire dans le navigateur.
//
// Lecture À L'APPEL, pas au chargement du module : les tests restent sur le
// défaut et peuvent la poser avec `vi.stubEnv`.

/** Racine de l'API Anthropic (`POST /messages`). */
export const ANTHROPIC_BASE_URL_DEFAUT = "https://api.anthropic.com/v1";

/** Version du protocole, envoyée dans l'en-tête `anthropic-version`. */
export const ANTHROPIC_VERSION = "2023-06-01";

const LOCALE = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/.*)?$/;

export function baseAnthropic(): string {
  const v = process.env.ANTHROPIC_BASE_URL?.trim().replace(/\/+$/, "");
  if (!v) return ANTHROPIC_BASE_URL_DEFAUT;
  if (v === ANTHROPIC_BASE_URL_DEFAUT || LOCALE.test(v)) return v;
  console.error("[anthropic] ANTHROPIC_BASE_URL ignorée : seule une adresse locale est acceptée.");
  return ANTHROPIC_BASE_URL_DEFAUT;
}

/** `urlAnthropic("/messages")` → `<base>/messages`. */
export const urlAnthropic = (chemin: string): string =>
  baseAnthropic() + (chemin.startsWith("/") ? chemin : "/" + chemin);

/** En-têtes d'un appel : la clé du compte, jamais journalisée. */
export const enTetesAnthropic = (cle: string): Record<string, string> => ({
  "x-api-key": cle,
  "anthropic-version": ANTHROPIC_VERSION,
  "Content-Type": "application/json",
});
