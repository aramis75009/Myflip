// Adresse de l'API Ollama Cloud, en un seul endroit.
//
// Même principe que `lib/openrouterBase.ts`, dont ce module est le jumeau :
// en production rien ne change, sans `OLLAMA_BASE_URL` c'est l'adresse
// publique. La variable n'existe que pour la suite e2e, qui la pointe vers un
// serveur factice local : aucun test n'appelle le vrai Ollama Cloud.
//
// On n'accepte que le défaut ou une adresse LOCALE (http sur localhost,
// 127.0.0.1 ou [::1]) : une variable mal posée en prod ne doit jamais pouvoir
// envoyer les clés des comptes vers un autre hôte. Ne JAMAIS la préfixer
// `NEXT_PUBLIC_` : elle n'a rien à faire dans le navigateur.
//
// Lecture À L'APPEL, pas au chargement du module : les tests restent sur le
// défaut et peuvent la poser avec `vi.stubEnv`.

/** Point d'entrée compatible OpenAI d'Ollama Cloud (`POST /chat/completions`). */
export const OLLAMA_BASE_URL_DEFAUT = "https://ollama.com/v1";

const LOCALE = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/.*)?$/;

export function baseOllama(): string {
  const v = process.env.OLLAMA_BASE_URL?.trim().replace(/\/+$/, "");
  if (!v) return OLLAMA_BASE_URL_DEFAUT;
  if (v === OLLAMA_BASE_URL_DEFAUT || LOCALE.test(v)) return v;
  console.error("[ollama] OLLAMA_BASE_URL ignorée : seule une adresse locale est acceptée.");
  return OLLAMA_BASE_URL_DEFAUT;
}

/** `urlOllama("/chat/completions")` → `<base>/chat/completions`. */
export const urlOllama = (chemin: string): string =>
  baseOllama() + (chemin.startsWith("/") ? chemin : "/" + chemin);
