-- Ollama Cloud, fournisseur IA par défaut des annonces et de l'assistant.
--
-- Quatre colonnes NULLABLES, rien d'autre : aucune donnée existante n'est
-- touchée, aucune colonne retirée (`geminiKey`, `anthropicKey` et
-- `Article.photosPretes` restent en base). Null = valeur par défaut de l'app
-- (Ollama Cloud, modèle par défaut du fournisseur), donc un compte existant
-- bascule sur Ollama Cloud dès son déploiement, sans aucune ligne à remplir.
--
-- "ollamaKey" est chiffrée comme "openrouterKey" (AES-256-GCM, côté application).
ALTER TABLE "UserSettings"
  ADD COLUMN "ollamaKey" TEXT,
  ADD COLUMN "fournisseurIA" TEXT,
  ADD COLUMN "modeleOllamaIA" TEXT,
  ADD COLUMN "modeleOllamaChatIA" TEXT;
