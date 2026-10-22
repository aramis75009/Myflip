-- Studio IA — génération par API OpenRouter (PRD du 19/10, §8).
--
-- ÉCRITE À LA MAIN, comme 20261018120000_studio_ia : `migrate dev` et
-- `db push` ajouteraient un DROP de Article.photosPretes et de
-- UserSettings.geminiKey / anthropicKey, conservées sur demande d'Aramis.
-- Aucune instruction ici ne touche Article ni UserSettings.

-- ── Un essai porte son modèle et son coût ───────────────────────────────────
-- `modele` est NOT NULL DEFAULT 'manuel' (et non nullable) : la numérotation
-- devient unique par modèle, et un NULL rendrait deux dépôts manuels n° 1
-- distincts aux yeux de Postgres. Les essais existants sont tous manuels.
ALTER TABLE "public"."StudioEssai"
    ADD COLUMN "modele" TEXT NOT NULL DEFAULT 'manuel',
    -- estimation au lancement, NULL quand le tarif est inconnu (jamais inventé)
    ADD COLUMN "coutEstimeUsd" DOUBLE PRECISION,
    -- usage.cost renvoyé par OpenRouter, NULL s'il ne l'a pas renvoyé
    ADD COLUMN "coutReelUsd" DOUBLE PRECISION,
    -- regroupe les essais d'un même clic « Générer »
    ADD COLUMN "lancementId" TEXT,
    -- l'essai raté dont celui-ci est la correction
    ADD COLUMN "essaiParentId" TEXT;

-- Le numéro se compte par coloris × angle × modèle : trois modèles lancés
-- ensemble font chacun leur essai n° 1, et le « taux au 1er essai » garde son sens.
DROP INDEX "public"."StudioEssai_colorisId_angleId_numero_key";
CREATE UNIQUE INDEX "StudioEssai_colorisId_angleId_modele_numero_key"
    ON "public"."StudioEssai"("colorisId", "angleId", "modele", "numero");

ALTER TABLE "public"."StudioEssai"
    ADD CONSTRAINT "StudioEssai_essaiParentId_fkey" FOREIGN KEY ("essaiParentId")
    REFERENCES "public"."StudioEssai"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Modèles d'image favoris, par compte ─────────────────────────────────────
CREATE TABLE "public"."StudioModeleFavori" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "modele" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudioModeleFavori_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudioModeleFavori_userId_modele_key" ON "public"."StudioModeleFavori"("userId", "modele");

ALTER TABLE "public"."StudioModeleFavori"
    ADD CONSTRAINT "StudioModeleFavori_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Générations en échec ────────────────────────────────────────────────────
-- Un échec ne consomme pas de numéro d'essai et n'entre dans aucun taux, mais
-- il se compte au bilan (blocages de sécurité à part) avec son coût éventuel.
CREATE TABLE "public"."StudioEchec" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "colorisId" TEXT NOT NULL,
    "angleId" TEXT NOT NULL,
    "modele" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "lancementId" TEXT,
    "coutReelUsd" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudioEchec_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StudioEchec_userId_idx" ON "public"."StudioEchec"("userId");
CREATE INDEX "StudioEchec_colorisId_idx" ON "public"."StudioEchec"("colorisId");

ALTER TABLE "public"."StudioEchec"
    ADD CONSTRAINT "StudioEchec_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."StudioEchec"
    ADD CONSTRAINT "StudioEchec_colorisId_fkey" FOREIGN KEY ("colorisId")
    REFERENCES "public"."StudioColoris"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RESTRICT, comme StudioEssai.angleId : un angle qui a servi se garde.
ALTER TABLE "public"."StudioEchec"
    ADD CONSTRAINT "StudioEchec_angleId_fkey" FOREIGN KEY ("angleId")
    REFERENCES "public"."StudioAngle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
