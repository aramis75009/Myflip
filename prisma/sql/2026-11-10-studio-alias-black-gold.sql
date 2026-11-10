-- ─────────────────────────────────────────────────────────────────────────────
-- Studio : alias de coloris « 5883-black-gold » → « 5880-black-gold »
-- Décision d'Aramis du 10/11/2026 (code : lib/studioAlias.ts).
--
-- SacBase liste deux coloris pour le même sac. Le Studio n'en montre plus
-- qu'un, 5880. Ce script déplace, pour chaque utilisateur, ce qui est encore
-- rattaché à sa ligne StudioColoris « 5883-black-gold » vers sa ligne
-- « 5880-black-gold » : vraies photos (StudioReference), essais (StudioEssai)
-- et échecs (StudioEchec ; sans ce déplacement, ils partiraient en CASCADE
-- avec la ligne 5883).
--
-- À COLLER À LA MAIN dans l'éditeur SQL de Supabase (prod), APRÈS le
-- déploiement du code de l'alias (sinon l'ancien code recrée la ligne 5883 à
-- la prochaine photo de SDN40 / SDN60), quand personne n'utilise le Studio.
-- Essai à blanc : remplacer le COMMIT final par ROLLBACK.
--
-- Idempotent : relancé, il ne fait rien de plus (plus de ligne 5883, ou plus
-- rien de déplaçable). Tout se fait dans une seule transaction.
--
-- Règles :
--   1. La ligne 5880 est créée si elle manque (modele '5880', coloris et
--      détails repris de la ligne 5883 ; id et createdAt : Prisma ne pose pas
--      de défaut SQL pour l'id, d'où gen_random_uuid()).
--   2. Les détails de 5883 sont ajoutés à ceux de 5880 s'ils n'y sont pas déjà.
--   3. Conflits : 5880 garde toujours l'existant.
--      - Essai : unique (colorisId, angleId, modele, numero). Un essai de 5883
--        dont le triplet angle × modèle × numéro existe déjà dans 5880 reste
--        sur 5883.
--      - Photo : le numéro de prise (ordre) est unique par coloris côté
--        application. Une photo de 5883 dont l'ordre est déjà pris dans 5880
--        reste sur 5883.
--      - Cohérence : une photo et ses essais (et ses échecs) restent ensemble.
--        Si l'un est bloqué, l'autre l'est aussi.
--   4. La ligne 5883 n'est supprimée que vide (plus aucune photo, aucun essai,
--      aucun échec) : rien ne part en CASCADE.
-- Le SELECT final montre ce qui reste ; une ligne 5883 encore listée = des
-- conflits, à régler à la main (ses photos et essais comptent déjà pour la
-- carte 5880 de l'accueil).
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. La ligne cible, si elle manque.
INSERT INTO "public"."StudioColoris" ("id", "userId", "cle", "modele", "coloris", "details")
SELECT gen_random_uuid()::text, s."userId", '5880-black-gold', '5880', s."coloris", s."details"
FROM "public"."StudioColoris" s
WHERE s."cle" = '5883-black-gold'
ON CONFLICT ("userId", "cle") DO NOTHING;

-- 2. Les détails à préserver de 5883, sans doublon.
UPDATE "public"."StudioColoris" c
SET "details" = CASE WHEN c."details" = '' THEN s."details" ELSE c."details" || E'\n' || s."details" END
FROM "public"."StudioColoris" s
WHERE s."cle" = '5883-black-gold'
  AND c."cle" = '5880-black-gold'
  AND c."userId" = s."userId"
  AND s."details" <> ''
  AND strpos(c."details", s."details") = 0;

-- 3. Paires (source 5883, cible 5880) par utilisateur.
CREATE TEMP TABLE alias_paire ON COMMIT DROP AS
SELECT s."id" AS source_id, c."id" AS cible_id
FROM "public"."StudioColoris" s
JOIN "public"."StudioColoris" c ON c."userId" = s."userId" AND c."cle" = '5880-black-gold'
WHERE s."cle" = '5883-black-gold';

-- 4a. Essais de 5883 en conflit avec un essai de 5880 (même angle, modèle, numéro).
CREATE TEMP TABLE alias_essai_conflit ON COMMIT DROP AS
SELECT e."id", e."referenceId"
FROM "public"."StudioEssai" e
JOIN alias_paire p ON e."colorisId" = p.source_id
WHERE EXISTS (
  SELECT 1 FROM "public"."StudioEssai" e2
  WHERE e2."colorisId" = p.cible_id
    AND e2."angleId" = e."angleId"
    AND e2."modele" = e."modele"
    AND e2."numero" = e."numero"
);

-- 4b. Photos de 5883 qui restent : ordre déjà pris dans 5880, ou photo d'un essai en conflit.
CREATE TEMP TABLE alias_ref_bloquee ON COMMIT DROP AS
SELECT r."id"
FROM "public"."StudioReference" r
JOIN alias_paire p ON r."colorisId" = p.source_id
WHERE r."ordre" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "public"."StudioReference" r2
    WHERE r2."colorisId" = p.cible_id AND r2."ordre" = r."ordre"
  )
UNION
SELECT ec."referenceId" FROM alias_essai_conflit ec WHERE ec."referenceId" IS NOT NULL;

-- 4c. Essais de 5883 qui restent : en conflit, ou attachés à une photo qui reste.
CREATE TEMP TABLE alias_essai_bloque ON COMMIT DROP AS
SELECT ec."id" FROM alias_essai_conflit ec
UNION
SELECT e."id"
FROM "public"."StudioEssai" e
JOIN alias_paire p ON e."colorisId" = p.source_id
WHERE EXISTS (SELECT 1 FROM alias_ref_bloquee b WHERE b."id" = e."referenceId");

-- 5. Déplacements.
UPDATE "public"."StudioReference" r
SET "colorisId" = p.cible_id
FROM alias_paire p
WHERE r."colorisId" = p.source_id
  AND NOT EXISTS (SELECT 1 FROM alias_ref_bloquee b WHERE b."id" = r."id");

UPDATE "public"."StudioEssai" e
SET "colorisId" = p.cible_id
FROM alias_paire p
WHERE e."colorisId" = p.source_id
  AND NOT EXISTS (SELECT 1 FROM alias_essai_bloque b WHERE b."id" = e."id");

UPDATE "public"."StudioEchec" x
SET "colorisId" = p.cible_id
FROM alias_paire p
WHERE x."colorisId" = p.source_id
  AND NOT EXISTS (SELECT 1 FROM alias_ref_bloquee b WHERE b."id" = x."referenceId");

-- 6. La ligne 5883, seulement vide (essais et échecs partiraient en CASCADE).
DELETE FROM "public"."StudioColoris" s
USING alias_paire p
WHERE s."id" = p.source_id
  AND NOT EXISTS (SELECT 1 FROM "public"."StudioReference" r WHERE r."colorisId" = s."id")
  AND NOT EXISTS (SELECT 1 FROM "public"."StudioEssai" e WHERE e."colorisId" = s."id")
  AND NOT EXISTS (SELECT 1 FROM "public"."StudioEchec" x WHERE x."colorisId" = s."id");

COMMIT;

-- Bilan : attendu, une seule ligne par utilisateur, « 5880-black-gold ».
SELECT
  c."userId",
  c."cle",
  (SELECT count(*) FROM "public"."StudioReference" r WHERE r."colorisId" = c."id") AS photos,
  (SELECT count(*) FROM "public"."StudioEssai" e WHERE e."colorisId" = c."id") AS essais,
  (SELECT count(*) FROM "public"."StudioEchec" x WHERE x."colorisId" = c."id") AS echecs
FROM "public"."StudioColoris" c
WHERE c."cle" IN ('5883-black-gold', '5880-black-gold')
ORDER BY c."userId", c."cle";
