-- Studio : retouches par lot et Versions d'un sac (PRD 2026-11-16, étape 2).
--
-- ÉCRITE À LA MAIN et IDEMPOTENTE (IF NOT EXISTS, gardes sur les contraintes) :
-- on peut la coller deux fois dans l'éditeur SQL de Supabase sans effet. Elle
-- n'ajoute que deux colonnes NULLABLES et un index unique sur "StudioReference",
-- et crée deux tables neuves. Aucune ligne existante n'est modifiée, rien n'est
-- supprimé, et elle ne touche ni Article ni UserSettings (pas de DROP de
-- "photosPretes" ni de "geminiKey" : `db push` les proposerait, on ne l'utilise pas).
--
--   "StudioReference"."retouche"    : réglages complets d'une copie (angle, mode,
--                                     recadrage, cadre), en JSON. NULL = vraie photo,
--                                     ou copie pivotée d'avant (lue « angle seul, zoom »).
--   "StudioReference"."retoucheCle" : clé canonique de ces réglages. Index unique
--                                     ("copieDeId", "retoucheCle") : une copie par
--                                     photo et par retouche. Postgres ne compte pas
--                                     les NULL comme égaux : les lignes existantes
--                                     (toutes à NULL) n'y sont pas soumises.
--   "StudioVersion"                 : Version 2, 3… d'un coloris (la Version 1 est
--                                     l'état actuel de l'annonce, jamais stockée).
--   "StudioVersionPhoto"            : photos ordonnées d'une version. Supprimer une
--                                     version supprime ses lignes (CASCADE) ; une
--                                     photo utilisée par une version ne se supprime
--                                     pas (NO ACTION).

ALTER TABLE "public"."StudioReference"
    ADD COLUMN IF NOT EXISTS "retouche" JSONB,
    ADD COLUMN IF NOT EXISTS "retoucheCle" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "StudioReference_copieDeId_retoucheCle_key"
    ON "public"."StudioReference"("copieDeId", "retoucheCle");

CREATE TABLE IF NOT EXISTS "public"."StudioVersion" (
    "id" TEXT NOT NULL,
    "colorisId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "skuSource" TEXT,
    "titre" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "motsCles" TEXT NOT NULL DEFAULT '',
    "skuAnnonce" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "StudioVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."StudioVersionPhoto" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL,
    CONSTRAINT "StudioVersionPhoto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "StudioVersion_userId_idx"
    ON "public"."StudioVersion"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "StudioVersion_colorisId_numero_key"
    ON "public"."StudioVersion"("colorisId", "numero");
CREATE INDEX IF NOT EXISTS "StudioVersionPhoto_referenceId_idx"
    ON "public"."StudioVersionPhoto"("referenceId");
CREATE UNIQUE INDEX IF NOT EXISTS "StudioVersionPhoto_versionId_ordre_key"
    ON "public"."StudioVersionPhoto"("versionId", "ordre");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StudioVersion_colorisId_fkey') THEN
        ALTER TABLE "public"."StudioVersion"
            ADD CONSTRAINT "StudioVersion_colorisId_fkey" FOREIGN KEY ("colorisId")
            REFERENCES "public"."StudioColoris"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StudioVersion_userId_fkey') THEN
        ALTER TABLE "public"."StudioVersion"
            ADD CONSTRAINT "StudioVersion_userId_fkey" FOREIGN KEY ("userId")
            REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StudioVersionPhoto_versionId_fkey') THEN
        ALTER TABLE "public"."StudioVersionPhoto"
            ADD CONSTRAINT "StudioVersionPhoto_versionId_fkey" FOREIGN KEY ("versionId")
            REFERENCES "public"."StudioVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StudioVersionPhoto_referenceId_fkey') THEN
        ALTER TABLE "public"."StudioVersionPhoto"
            ADD CONSTRAINT "StudioVersionPhoto_referenceId_fkey" FOREIGN KEY ("referenceId")
            REFERENCES "public"."StudioReference"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
    END IF;
END $$;
