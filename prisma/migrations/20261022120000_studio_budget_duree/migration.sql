-- Studio — budget par sac, taux de change et durée de génération
-- (refonte du 20/10, PRD § 8 « Studio — modèles, coût et tests »).
--
-- ÉCRITE À LA MAIN, comme les migrations Studio précédentes : `migrate dev` et
-- `db push` ajouteraient un DROP de Article.photosPretes et de
-- UserSettings.geminiKey / anthropicKey, conservées sur demande d'Aramis.
-- AJOUTS SEULEMENT : quatre colonnes, aucune table, aucun index, aucun DROP,
-- aucune modification de colonne existante, rien sur Article ni UserSettings.
-- Les lignes existantes prennent les défauts (budget 1 €, taux 0,86) ou NULL
-- (durée : jamais inventée pour les essais passés).

-- ── Budget par sac et taux de conversion, un jeu par compte ─────────────────
-- Budget d'un sac complet (15 prises), en euros ; le serveur le compare à
-- l'estimation d'un lancement. Taux = euros pour 1 dollar (OpenRouter facture
-- en dollars) : affiché et réglable dans les réglages du Studio.
ALTER TABLE "public"."StudioReglages"
    ADD COLUMN "budgetParSacEur" DOUBLE PRECISION NOT NULL DEFAULT 1,
    ADD COLUMN "tauxEurParUsd" DOUBLE PRECISION NOT NULL DEFAULT 0.86;

-- ── Durée de l'appel de génération ──────────────────────────────────────────
-- En millisecondes. NULL pour un dépôt manuel et pour les essais d'avant.
ALTER TABLE "public"."StudioEssai" ADD COLUMN "dureeMs" INTEGER;
-- Durée avant l'échec, quand elle a été mesurée.
ALTER TABLE "public"."StudioEchec" ADD COLUMN "dureeMs" INTEGER;
