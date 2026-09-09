-- Le prix rejoint le prompt, le délai devient un réglage par lot (08/09/2026).
--
-- ⚠️  MIGRATION ÉCRITE À LA MAIN — cf. l'en-tête de 20260808150000_user_settings.
--     `prisma migrate dev` et `prisma db push` produisent un
--     DROP COLUMN "photosPretes" (table Article) : les refuser.
--
-- Cette migration porte l'ÉTAT FINAL. Les deux qui la précèdent
-- (20260818000000_add_prix_reference, 20260818200000_add_delai_vinted) sont
-- déjà appliquées sur la base de dev : les réécrire ferait diverger leur somme
-- de contrôle, d'où le choix d'en ajouter une plutôt que de les corriger. La
-- production, qui n'a vu aucune des trois, les appliquera d'affilée et
-- atterrira directement dans l'état voulu — la table PrixReference y existera
-- le temps d'une transaction.
--
-- ⚠️  DESTRUCTIVE. La table "PrixReference" est peuplée sur dev. Son contenu a
--     été relevé dans docs/audits/2026-09-08-prix-reference-avant-migration.md
--     et doit être ressaisi À LA MAIN dans les prompts. Cette migration ne fait
--     pas le report : plusieurs prompts peuvent correspondre à un même prix, et
--     elle ne saurait pas lequel choisir.

-- Le prix vit désormais sur le prompt qui le concerne.
ALTER TABLE "public"."PromptTemplate" ADD COLUMN "prixReference" DOUBLE PRECISION;

-- La table de prix disparaît, avec sa clé étrangère et ses quatre index.
DROP TABLE "public"."PrixReference";

-- La fourchette de délai n'est plus un réglage de compte : elle est choisie
-- dans un pop-up au lancement et voyage avec le lot.
ALTER TABLE "public"."UserSettings"
    DROP COLUMN "delaiVintedMinMinutes",
    DROP COLUMN "delaiVintedMaxMinutes";
