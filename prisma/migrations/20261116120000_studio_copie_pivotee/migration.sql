-- Studio : copies pivotées d'une vraie photo (outil « Pivoter » de la planche).
--
-- ÉCRITE À LA MAIN et IDEMPOTENTE (IF NOT EXISTS, garde sur la contrainte) :
-- on peut la coller deux fois dans l'éditeur SQL de Supabase sans effet. Elle
-- n'ajoute que deux colonnes NULLABLES, un index unique et une clé étrangère sur
-- "StudioReference". Aucune ligne n'est modifiée, rien n'est supprimé, et elle
-- ne touche ni Article ni UserSettings (pas de DROP de "photosPretes" ni de
-- "geminiKey" : `db push` les proposerait, on ne l'utilise pas).
--
--   "copieDeId"  : la vraie photo dont la ligne est la copie. NULL = vraie photo
--                  (toutes les lignes existantes). ON DELETE CASCADE : retirer la
--                  photo retire ses copies.
--   "angleCopie" : l'angle de la copie, en degrés entiers (−45 à +45).
--
-- L'index unique ("copieDeId", "angleCopie") garantit une seule copie par photo
-- et par angle. Postgres ne compte pas les NULL comme égaux : les vraies photos
-- (deux colonnes NULL) n'y sont pas soumises.

ALTER TABLE "public"."StudioReference"
    ADD COLUMN IF NOT EXISTS "copieDeId" TEXT,
    ADD COLUMN IF NOT EXISTS "angleCopie" INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS "StudioReference_copieDeId_angleCopie_key"
    ON "public"."StudioReference"("copieDeId", "angleCopie");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'StudioReference_copieDeId_fkey'
    ) THEN
        ALTER TABLE "public"."StudioReference"
            ADD CONSTRAINT "StudioReference_copieDeId_fkey" FOREIGN KEY ("copieDeId")
            REFERENCES "public"."StudioReference"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
