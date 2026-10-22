-- Studio — variantes d'angle (passation Claude Design du 20/10, tour 2).
--
-- ÉCRITE À LA MAIN, comme les deux migrations Studio précédentes : `migrate
-- dev` et `db push` ajouteraient un DROP de Article.photosPretes et de
-- UserSettings.geminiKey / anthropicKey, conservées sur demande d'Aramis.
-- Aucune instruction ici ne touche Article ni UserSettings, et aucune ne
-- supprime quoi que ce soit (ni table, ni colonne, ni index).

-- ── Prompt maître, un par compte ────────────────────────────────────────────
-- Envoyé une fois en tête de conversation Gemini, placé en tête de chaque
-- génération par API. Table à part plutôt qu'une colonne de UserSettings :
-- le Studio garde ses propres tables.
CREATE TABLE "public"."StudioReglages" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "promptMaitre" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudioReglages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudioReglages_userId_key" ON "public"."StudioReglages"("userId");

ALTER TABLE "public"."StudioReglages"
    ADD CONSTRAINT "StudioReglages_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Prompts d'angle : StudioAngle, archivable ───────────────────────────────
-- `nom` devient le nom court (en-tête de colonne), `angle` le texte envoyé
-- (« Angle: … »). Un angle qui a servi ne se supprime pas : on l'archive, et
-- modifier son texte crée une nouvelle version.
ALTER TABLE "public"."StudioAngle" ADD COLUMN "archiveLe" TIMESTAMP(3);
-- Le rôle de photo à joindre ne sert plus (la photo jointe est celle de la
-- ligne) : la colonne reste, avec un défaut vide pour les nouveaux angles.
ALTER TABLE "public"."StudioAngle" ALTER COLUMN "roleReference" SET DEFAULT '';
-- Les 7 angles fixes du banc de test sont archivés, pas supprimés : leurs
-- essais restent rattachés (RESTRICT). Aramis saisira ses prompts en prod.
UPDATE "public"."StudioAngle" SET "archiveLe" = CURRENT_TIMESTAMP WHERE "archiveLe" IS NULL;

-- ── Vraies photos : une ligne du tableau par prise ──────────────────────────
-- `ordre` = numéro de la prise (1 à 15) ; NULL = photo gardée mais pas une
-- ligne du tableau (photos conservées à la mise en vente, anciennes références).
ALTER TABLE "public"."StudioReference"
    ADD COLUMN "ordre" INTEGER,
    ADD COLUMN "prise" TEXT;

CREATE INDEX "StudioReference_colorisId_ordre_idx" ON "public"."StudioReference"("colorisId", "ordre");

-- ── Essai → photo → annonce ─────────────────────────────────────────────────
-- `referenceId` : la vraie photo de la ligne. RESTRICT : une photo qui a servi
-- ne se supprime pas, sinon sa case se déverrouillerait sans bruit. NULL pour
-- les essais du banc de test.
-- `skuCible` : le sac dont l'annonce recevra l'image validée (ex. SDN15). Pas
-- de clé étrangère vers Article, comme StudioReference.sku.
ALTER TABLE "public"."StudioEssai"
    ADD COLUMN "referenceId" TEXT,
    ADD COLUMN "skuCible" TEXT;

ALTER TABLE "public"."StudioEssai"
    ADD CONSTRAINT "StudioEssai_referenceId_fkey" FOREIGN KEY ("referenceId")
    REFERENCES "public"."StudioReference"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "StudioEssai_referenceId_angleId_idx" ON "public"."StudioEssai"("referenceId", "angleId");
CREATE INDEX "StudioEssai_skuCible_idx" ON "public"."StudioEssai"("skuCible");

-- Un échec dit aussi quelle case il visait.
ALTER TABLE "public"."StudioEchec" ADD COLUMN "referenceId" TEXT;

ALTER TABLE "public"."StudioEchec"
    ADD CONSTRAINT "StudioEchec_referenceId_fkey" FOREIGN KEY ("referenceId")
    REFERENCES "public"."StudioReference"("id") ON DELETE SET NULL ON UPDATE CASCADE;
