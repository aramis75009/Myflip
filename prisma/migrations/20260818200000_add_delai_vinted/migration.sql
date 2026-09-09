-- Extension Vinted : fourchette de délai anti-ban (18/08/2026).
--
-- ⚠️  MIGRATION ÉCRITE À LA MAIN — cf. l'en-tête de 20260808150000_user_settings.
--     `prisma migrate dev` et `prisma db push` produisent un
--     DROP COLUMN "photosPretes" (table Article) : les refuser.
--
-- Contexte : avant de remplir automatiquement un nouvel onglet Vinted,
-- l'extension attend un délai aléatoire entre `delaiVintedMinMinutes` et
-- `delaiVintedMaxMinutes`, garde-fou anti-ban. Nullable, PAS de défaut :
-- Aramis doit choisir sa propre fourchette, un délai implicite de 0
-- annulerait le garde-fou.
--
-- AUCUNE COLONNE N'EST SUPPRIMÉE.

ALTER TABLE "public"."UserSettings"
    ADD COLUMN "delaiVintedMinMinutes" INTEGER,
    ADD COLUMN "delaiVintedMaxMinutes" INTEGER;
