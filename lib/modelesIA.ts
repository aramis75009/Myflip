// Catalogue des modèles proposés pour la génération d'annonces et l'assistant,
// pour chaque fournisseur : Ollama Cloud (par défaut depuis le 03/11/2026, section
// « Ollama Cloud » plus bas), OpenRouter (secours, tout ce qui suit jusqu'à elle)
// et Anthropic (04/11/2026, section « Anthropic » en bas de fichier). Tous
// passent par `modeleChoisi`, qui dit quel fournisseur et quel modèle un compte
// utilise.
//
// Module PARTAGÉ client/serveur, et volontairement sans dépendance : il est
// importé par `components/compte/Integrations.tsx` (composant client) autant que
// par la route de génération. Y ajouter un import serveur ferait entrer le SDK
// et les secrets dans le bundle navigateur.
//
// ⚠️ Pour OpenRouter, deux capacités sont NON NÉGOCIABLES pour figurer ici :
//   • lecture d'image en entrée  — l'annonce est écrite à partir des photos ;
//   • sortie JSON structurée     — la réponse est parsée, pas lue par un humain.
// Un modèle qui n'a pas les deux échoue à CHAQUE génération, pas une fois sur
// dix. La liste ci-dessous a été relevée sur `openrouter.ai/api/v1/models` en
// filtrant sur `input_modalities: image` + `supported_parameters:
// structured_outputs` — refaire ce filtrage avant d'y ajouter une ligne.

export type ModelePropose = {
  /** Identifiant du modèle, tel qu'attendu par le champ `model` de l'API du fournisseur. */
  id: string;
  libelle: string;
  /**
   * Repère de coût affiché à côté du nom, en $ par million de tokens. `null` =
   * pas de prix au jeton (Ollama Cloud se paie au forfait) : rien n'est affiché
   * plutôt qu'un prix inventé.
   */
  prix: string | null;
  note: string;
  /** Lit des images en entrée. Renseigné pour le catalogue Ollama. */
  vision?: boolean;
  /** Sait appeler des outils (function calling). Renseigné pour le catalogue Ollama. */
  tools?: boolean;
  /**
   * Niveau de `reasoning_effort` à envoyer, par usage ; `null` = ne rien envoyer.
   * Absent = ne rien envoyer non plus. Ollama refuse le paramètre sur un modèle
   * qui ne sait pas réfléchir : on n'en pose que là où c'est connu.
   */
  reflexion?: { annonce: EffortReflexion | null; chat: EffortReflexion | null };
};

/**
 * Niveau d'`output_config.effort` à envoyer à Anthropic, par usage. Même
 * convention que `reflexion` : absent ou `null` = ne rien envoyer (un modèle
 * ancien ou saisi à la main peut refuser le champ).
 */
export type EffortAnthropic = EffortReflexion;

/** Valeurs de `reasoning_effort` que nous envoyons à Ollama Cloud. */
export type EffortReflexion = "low" | "medium" | "high";

// ── Fournisseurs ────────────────────────────────────────────────────────────

/**
 * Qui sert les annonces et l'assistant.
 *
 * Ollama Cloud est le défaut depuis le 03/11/2026 (plus de crédit OpenRouter).
 * OpenRouter reste en secours : son code, son catalogue et sa clé sont intacts,
 * et un compte le choisit dans « Mon compte ». Le Studio IA (génération et avis
 * sur les images, `lib/studio*`) n'est PAS concerné : Ollama Cloud ne génère pas
 * d'images, il reste sur OpenRouter quel que soit ce réglage.
 */
export type FournisseurIA = "ollama" | "openrouter" | "anthropic";

export const FOURNISSEUR_PAR_DEFAUT: FournisseurIA = "ollama";

export const FOURNISSEURS_IA: { id: FournisseurIA; libelle: string; note: string }[] = [
  {
    id: "ollama",
    libelle: "Ollama Cloud",
    note: "Le fournisseur par défaut. Forfait Ollama, pas de crédit à recharger.",
  },
  {
    id: "openrouter",
    libelle: "OpenRouter",
    note: "Le secours : un crédit à recharger, un très large choix de modèles.",
  },
  {
    id: "anthropic",
    libelle: "Anthropic",
    note: "Claude en direct, avec ta clé API Anthropic : facturé au jeton sur ton compte Anthropic.",
  },
];

/** Vrai si la valeur est un fournisseur connu (une valeur en base peut être périmée). */
export function estFournisseurIA(v: unknown): v is FournisseurIA {
  return v === "ollama" || v === "openrouter" || v === "anthropic";
}

/** Fournisseur effectif d'un compte : son choix, sinon Ollama Cloud. */
export function fournisseurEffectif(choisi: string | null | undefined): FournisseurIA {
  return estFournisseurIA(choisi) ? choisi : FOURNISSEUR_PAR_DEFAUT;
}

export function libelleFournisseur(f: FournisseurIA): string {
  return FOURNISSEURS_IA.find((x) => x.id === f)?.libelle ?? f;
}

/** Ce que le modèle doit faire : rédiger une annonce d'après des photos, ou tenir l'assistant. */
export type UsageIA = "annonce" | "chat";

/**
 * Modèle utilisé quand le compte n'a rien choisi.
 *
 * C'est exactement le modèle qui rédigeait les annonces avant le passage par
 * OpenRouter. Le défaut ne change donc RIEN à la qualité des sorties : seule la
 * facturation change de guichet. Un défaut « moins cher » aurait obligé à
 * re-régler les prompts, qui sont calibrés (titre saturé à 100 caractères,
 * ~80 mots-clés sur 7 langues) sur le comportement de ce modèle-là.
 */
export const MODELE_PAR_DEFAUT = "google/gemini-3.6-flash";
// ⚠️ « Par défaut » = défaut du fournisseur OpenRouter. Le fournisseur par défaut
// de l'application est Ollama Cloud (`MODELE_OLLAMA_PAR_DEFAUT`, plus bas) ;
// celui-ci reste lu par `lib/studioVerif.ts` (avis IA du Studio, qui lit des
// images via OpenRouter) : ne pas le remplacer par un identifiant Ollama.

export const MODELES_PROPOSES: ModelePropose[] = [
  {
    id: "google/gemini-3.6-flash",
    libelle: "Gemini 3.6 Flash",
    prix: "0.75 / 3.75",
    note: "Le modèle d'avant. Mêmes annonces, autre facture.",
  },
  {
    id: "google/gemini-3.7-flash",
    libelle: "Gemini 3.7 Flash",
    prix: "0.38 / 1.88",
    note: "Plus récent et moins cher que 3.6 Flash, même famille.",
  },
  {
    id: "google/gemini-3.5-flash-lite",
    libelle: "Gemini 3.5 Flash Lite",
    prix: "0.30 / 2.50",
    note: "Cinq fois moins cher, même famille.",
  },
  {
    id: "anthropic/claude-haiku-4.5",
    libelle: "Claude Haiku 4.5",
    prix: "1.00 / 5.00",
    note: "À l'aise sur les mots-clés multilingues.",
  },
  {
    id: "anthropic/claude-sonnet-4.6",
    libelle: "Claude Sonnet 4.6",
    prix: "3.00 / 15.00",
    note: "Pour les pièces qui méritent une annonce impeccable.",
  },
  {
    id: "openai/gpt-5.4-mini",
    libelle: "GPT-5.4 mini",
    prix: "0.75 / 4.50",
    note: "Autre famille, utile en repli.",
  },
];

/**
 * Catalogue SÉPARÉ pour l'assistant conversationnel (bulle en bas à droite).
 *
 * L'assistant n'a besoin ni de lire des images ni de sortie JSON forcée : il
 * lui faut seulement l'appel d'outils (`tools`, function calling). C'est une
 * exigence plus large, mais pas superposable à `MODELES_PROPOSES` — DeepSeek,
 * utile ici pour son prix, n'a AUCUNE capacité image sur OpenRouter et ne
 * pourrait jamais figurer dans le catalogue des annonces.
 *
 * Vérifier `input_modalities` (peu importe pour ce catalogue) et
 * `supported_parameters: tools` sur `openrouter.ai/api/v1/models` avant d'y
 * ajouter une ligne.
 */
export const MODELES_CHAT_PROPOSES: ModelePropose[] = [
  {
    id: "anthropic/claude-sonnet-4.6",
    libelle: "Claude Sonnet 4.6",
    prix: "3.00 / 15.00",
    note: "Le modèle qui faisait déjà tourner l'assistant, via Anthropic direct.",
  },
  {
    id: "google/gemini-3.7-flash",
    libelle: "Gemini 3.7 Flash",
    prix: "0.38 / 1.88",
    note: "Rapide et très économique pour des échanges courts.",
  },
  {
    id: "deepseek/deepseek-v4-flash-0731",
    libelle: "DeepSeek V4 Flash",
    prix: "0.14 / 0.28",
    note: "Le moins cher du lot. Pas d'image, sans importance ici.",
  },
  {
    id: "openai/gpt-5.4-mini",
    libelle: "GPT-5.4 mini",
    prix: "0.75 / 4.50",
    note: "Autre famille, utile en repli.",
  },
];

/**
 * Modèle utilisé par l'assistant quand le compte n'a rien choisi.
 *
 * C'est exactement le modèle codé en dur dans `/api/chat` avant le passage par
 * OpenRouter (`claude-sonnet-4-6` côté SDK Anthropic) : le défaut ne change
 * donc rien à la qualité des réponses, seule la facturation change de guichet.
 */
export const MODELE_CHAT_PAR_DEFAUT = "anthropic/claude-sonnet-4.6";

/** Vrai si l'identifiant ne fait pas partie du catalogue chat. */
export function estModeleChatLibre(id: string | null): boolean {
  if (!id) return false;
  return !MODELES_CHAT_PROPOSES.some((m) => m.id === id);
}

/** Vrai si l'identifiant ne fait pas partie de la liste courte. */
export function estModeleLibre(id: string | null): boolean {
  if (!id) return false;
  return !MODELES_PROPOSES.some((m) => m.id === id);
}

/**
 * Nom lisible d'un modèle, pour l'affichage.
 *
 * Un identifiant hors liste est rendu tel quel : c'est ce que l'utilisateur a
 * tapé, et le masquer derrière « Personnalisé » l'empêcherait de vérifier ce
 * qui tourne réellement. `null` = rien de choisi, donc le défaut.
 */
export function libelleModele(id: string | null): string {
  const cible = id?.trim() || MODELE_PAR_DEFAUT;
  return MODELES_PROPOSES.find((m) => m.id === cible)?.libelle ?? cible;
}

// ── Ollama Cloud ────────────────────────────────────────────────────────────
//
// Noms relevés sur `https://ollama.com/api/tags` (03/11/2026). Ollama Cloud se
// paie au forfait : aucun prix au jeton à afficher (`prix: null`).
//
// Mêmes exigences que pour OpenRouter, appliquées sur les capacités déclarées
// de chaque modèle :
//   • annonces → `vision` (l'annonce est écrite d'après les photos) ;
//   • assistant → `tools` (il appelle des outils pour lire et agir).
// Le JSON structuré n'est PAS une exigence ici : le cloud ne tient pas
// `response_format` de façon fiable, `lib/ollama.ts` décrit le schéma dans le
// prompt et valide la réponse lui-même.

/** Modèle des annonces quand le compte, sur Ollama Cloud, n'a rien choisi. */
export const MODELE_OLLAMA_PAR_DEFAUT = "deepseek-v4.1-flash";

/** Modèle de l'assistant quand le compte, sur Ollama Cloud, n'a rien choisi. */
export const MODELE_CHAT_OLLAMA_PAR_DEFAUT = "deepseek-v4.1-flash";

const CATALOGUE_OLLAMA: ModelePropose[] = [
  {
    id: "deepseek-v4.1-flash",
    libelle: "DeepSeek V4.1 Flash",
    prix: null,
    note: "Le choix par défaut : lit les photos, réfléchit avant d'écrire, appelle les outils.",
    vision: true,
    tools: true,
    // Les prompts demandent de saturer un titre à 100 caractères et ~80
    // mots-clés sur 7 langues : un passage de réflexion les tient (même raison
    // que le budget de 1024 jetons de `lib/openrouter.ts`). L'assistant, lui,
    // n'a qu'à enchaîner des outils : réflexion minimale.
    reflexion: { annonce: "medium", chat: "low" },
  },
  {
    id: "gemma4:31b",
    libelle: "Gemma 4 31B",
    prix: null,
    note: "Lit les photos et pèse moins lourd sur le forfait.",
    vision: true,
    tools: true,
    // Capacité de réflexion non vérifiée : on n'envoie rien (Ollama refuse
    // `reasoning_effort` sur un modèle qui ne réfléchit pas).
    reflexion: { annonce: null, chat: null },
  },
  {
    id: "glm-5.3-flash",
    libelle: "GLM 5.3 Flash",
    prix: null,
    note: "Autre famille, lit aussi les photos.",
    vision: true,
    tools: true,
    reflexion: { annonce: null, chat: null },
  },
];

export const MODELES_OLLAMA_PROPOSES: ModelePropose[] = CATALOGUE_OLLAMA.filter((m) => m.vision);

export const MODELES_CHAT_OLLAMA_PROPOSES: ModelePropose[] = CATALOGUE_OLLAMA.filter((m) => m.tools);

// ── Anthropic ───────────────────────────────────────────────────────────────
//
// Identifiants relevés dans la documentation de l'API Anthropic (04/11/2026),
// SANS suffixe de date : `claude-haiku-5-5` et `claude-sonnet-5-5` sont les
// identifiants complets. Prix en $ par million de jetons (entrée / sortie) ;
// ceux de Haiku valent pour un prompt de 100 000 jetons au plus, ce qu'une
// annonce (un prompt et quelques photos) ne dépasse pas.
//
// Les deux modèles lisent les images et appellent des outils : les deux
// catalogues contiennent les mêmes lignes, dans un ordre différent (Haiku en
// tête pour les annonces, Sonnet pour l'assistant). Ni l'un ni l'autre n'accepte
// `temperature` : on n'en envoie pas (cf. `lib/anthropic.ts`).

/** Modèle des annonces quand le compte, chez Anthropic, n'a rien choisi : rapide, lit les photos, bon marché. */
export const MODELE_ANTHROPIC_PAR_DEFAUT = "claude-haiku-5-5";

/** Modèle de l'assistant quand le compte, chez Anthropic, n'a rien choisi. */
export const MODELE_CHAT_ANTHROPIC_PAR_DEFAUT = "claude-sonnet-5-5";

const HAIKU: ModelePropose = {
  id: "claude-haiku-5-5",
  libelle: "Claude Haiku 5.5",
  prix: "0.10 / 0.50",
  note: "Le plus rapide et le moins cher : lit les photos, assez fin pour une annonce.",
  vision: true,
  tools: true,
  // Les prompts demandent de saturer un titre à 100 caractères et ~80 mots-clés
  // sur 7 langues : un effort moyen (le défaut de Haiku 5.5) les tient. Pour
  // l'assistant, qui enchaîne quelques outils, le plus bas suffit.
  reflexion: { annonce: "medium", chat: "low" },
};

const SONNET: ModelePropose = {
  id: "claude-sonnet-5-5",
  libelle: "Claude Sonnet 5.5",
  prix: "2.00 / 10.00",
  note: "Plus fin pour les pièces qui méritent une annonce impeccable, et pour l'assistant.",
  vision: true,
  tools: true,
  reflexion: { annonce: "medium", chat: "medium" },
};

export const MODELES_ANTHROPIC_PROPOSES: ModelePropose[] = [HAIKU, SONNET];

export const MODELES_CHAT_ANTHROPIC_PROPOSES: ModelePropose[] = [SONNET, HAIKU];

/**
 * Niveau d'`output_config.effort` à envoyer à Anthropic pour ce modèle, ou
 * `null` pour ne rien envoyer (modèle saisi à la main : un modèle ancien refuse
 * le champ).
 */
export function effortAnthropic(modele: string, usage: UsageIA): EffortAnthropic | null {
  return [HAIKU, SONNET].find((m) => m.id === modele)?.reflexion?.[usage] ?? null;
}

// ── Accès générique, quel que soit le fournisseur ───────────────────────────

/** Le catalogue à proposer pour ce fournisseur et cet usage. */
export function modelesProposes(f: FournisseurIA, usage: UsageIA): ModelePropose[] {
  if (f === "anthropic") return usage === "annonce" ? MODELES_ANTHROPIC_PROPOSES : MODELES_CHAT_ANTHROPIC_PROPOSES;
  if (f === "ollama") return usage === "annonce" ? MODELES_OLLAMA_PROPOSES : MODELES_CHAT_OLLAMA_PROPOSES;
  return usage === "annonce" ? MODELES_PROPOSES : MODELES_CHAT_PROPOSES;
}

/** Le modèle utilisé quand le compte n'a rien choisi pour ce fournisseur et cet usage. */
export function modeleParDefaut(f: FournisseurIA, usage: UsageIA): string {
  if (f === "anthropic") return usage === "annonce" ? MODELE_ANTHROPIC_PAR_DEFAUT : MODELE_CHAT_ANTHROPIC_PAR_DEFAUT;
  if (f === "ollama") return usage === "annonce" ? MODELE_OLLAMA_PAR_DEFAUT : MODELE_CHAT_OLLAMA_PAR_DEFAUT;
  return usage === "annonce" ? MODELE_PAR_DEFAUT : MODELE_CHAT_PAR_DEFAUT;
}

/** Vrai si l'identifiant (saisi à la main) ne figure pas dans le catalogue de ce fournisseur. */
export function estModeleHorsCatalogue(f: FournisseurIA, usage: UsageIA, id: string | null): boolean {
  if (!id) return false;
  return !modelesProposes(f, usage).some((m) => m.id === id);
}

/** « Nom — prix $/M », ou le nom seul quand il n'y a pas de prix au jeton. */
export function libelleOption(m: ModelePropose): string {
  return m.prix ? `${m.libelle} — ${m.prix} $/M` : m.libelle;
}

/**
 * Niveau de `reasoning_effort` à envoyer à Ollama Cloud pour ce modèle, ou
 * `null` pour ne rien envoyer (modèle inconnu, saisi à la main, ou sans
 * réflexion connue).
 */
export function effortReflexion(modele: string, usage: UsageIA): EffortReflexion | null {
  return CATALOGUE_OLLAMA.find((m) => m.id === modele)?.reflexion?.[usage] ?? null;
}

/** Le champ de `UserSettings` qui porte le modèle de ce fournisseur et de cet usage. */
export function champModele(
  f: FournisseurIA,
  usage: UsageIA,
):
  | "modeleIA"
  | "modeleChatIA"
  | "modeleOllamaIA"
  | "modeleOllamaChatIA"
  | "modeleAnthropicIA"
  | "modeleAnthropicChatIA" {
  if (f === "anthropic") return usage === "annonce" ? "modeleAnthropicIA" : "modeleAnthropicChatIA";
  if (f === "ollama") return usage === "annonce" ? "modeleOllamaIA" : "modeleOllamaChatIA";
  return usage === "annonce" ? "modeleIA" : "modeleChatIA";
}

/** Les champs de `UserSettings` qui décident du fournisseur et du modèle. */
export type ChoixModeleBrut = {
  fournisseurIA?: string | null;
  modeleIA?: string | null;
  modeleChatIA?: string | null;
  modeleOllamaIA?: string | null;
  modeleOllamaChatIA?: string | null;
  modeleAnthropicIA?: string | null;
  modeleAnthropicChatIA?: string | null;
};

/**
 * Fournisseur et modèle réellement utilisés par un compte.
 *
 * Un modèle n'a de sens que chez SON fournisseur : chaque fournisseur a donc sa
 * propre colonne (`modeleIA` reste celle d'OpenRouter). Changer de fournisseur
 * ne fait jamais envoyer un identifiant OpenRouter à Ollama, ni l'inverse (et
 * jamais un identifiant d'un autre fournisseur à Anthropic).
 * Rien de choisi pour ce couple = le défaut du fournisseur.
 */
export function modeleChoisi(
  brut: ChoixModeleBrut,
  usage: UsageIA,
): { fournisseur: FournisseurIA; modele: string } {
  const fournisseur = fournisseurEffectif(brut.fournisseurIA);
  const stocke = brut[champModele(fournisseur, usage)]?.trim();
  return { fournisseur, modele: stocke || modeleParDefaut(fournisseur, usage) };
}

/** Nom lisible du modèle d'un fournisseur ; un identifiant hors catalogue est rendu tel quel. */
export function libelleModeleIA(f: FournisseurIA, usage: UsageIA, id: string | null): string {
  const cible = id?.trim() || modeleParDefaut(f, usage);
  return modelesProposes(f, usage).find((m) => m.id === cible)?.libelle ?? cible;
}
