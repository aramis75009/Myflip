-- Date de mise en vente d'un article (29/09/2026).
--
-- ⚠️  MIGRATION ÉCRITE À LA MAIN — cf. l'en-tête de 20260808150000_user_settings.
--     `prisma migrate dev` et `prisma db push` produisent un
--     DROP COLUMN "photosPretes" (table Article) : les refuser.
--     Appliquer avec `npx prisma migrate deploy`, AVANT de déployer le code :
--     le build Vercel ne lance que `prisma generate`, et le client généré lit
--     cette colonne sur chaque article.
--
-- Contexte : savoir en combien de jours un article s'est vendu. La colonne est
-- posée au premier passage en « En vente » (lib/dateMiseEnVente.ts) et
-- corrigeable à la main. Nullable, SANS défaut ni rattrapage : les articles
-- existants restent vides, Aramis saisit les dates qu'il connaît.
--
-- AUCUNE COLONNE N'EST SUPPRIMÉE.

ALTER TABLE "public"."Article" ADD COLUMN "dateMiseEnVente" TIMESTAMP(3);
