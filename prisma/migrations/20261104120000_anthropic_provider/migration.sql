-- Anthropic, troisième fournisseur IA (annonces et assistant), avec une clé API
-- Anthropic saisie dans « Mon compte → Mes clés IA ».
--
-- Trois colonnes NULLABLES, rien d'autre, et IDEMPOTENTE (`IF NOT EXISTS`) :
--   • "anthropicKey" EXISTE DÉJÀ sur les bases créées avant le 15/08/2026 (elle
--     portait la clé de l'assistant, appelé alors en direct chez Anthropic ; la
--     migration 20260808150000 l'a créée). Elle est simplement redéclarée dans
--     `schema.prisma` et relue. Sur une base qui ne l'aurait pas (prod migrée à
--     la main), `IF NOT EXISTS` la crée. Le contenu existant n'est pas touché.
--   • "modeleAnthropicIA" / "modeleAnthropicChatIA" : le modèle choisi par le
--     compte chez Anthropic, pour les annonces et pour l'assistant. Null = modèle
--     par défaut du fournisseur, donc aucune ligne à remplir.
--
-- "anthropicKey" est chiffrée comme "openrouterKey" (AES-256-GCM, côté application).
-- Aucune colonne n'est retirée.
ALTER TABLE "UserSettings"
  ADD COLUMN IF NOT EXISTS "anthropicKey" TEXT,
  ADD COLUMN IF NOT EXISTS "modeleAnthropicIA" TEXT,
  ADD COLUMN IF NOT EXISTS "modeleAnthropicChatIA" TEXT;
