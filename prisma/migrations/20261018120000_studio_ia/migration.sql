-- Studio IA — banc de test de génération d'angles (18/10/2026).
--
-- ⚠️  MIGRATION ÉCRITE À LA MAIN — cf. l'en-tête de 20260725000000_init.
--     `prisma migrate dev` et `prisma db push` produisent un
--     DROP COLUMN "photosPretes" (table Article), plus un DROP sur
--     UserSettings."geminiKey" et "anthropicKey" : les refuser toutes les trois.
--     Appliquer avec `npx prisma migrate deploy`, AVANT de déployer le code :
--     le build Vercel ne lance que `prisma generate`.
--
-- Contexte : mesurer si un modèle d'image reproduit fidèlement un sac sous
-- d'autres angles, à partir de vraies photos. Spec du 17/10, §8.
--
-- ⚠️  CLOISONNEMENT (spec §7). Ces quatre tables sont un continent fermé :
--     aucune image générée ne doit pouvoir rejoindre une annonce. Rien ici ne
--     référence "Article", et rien dans "Article" ne référence ceci. Le test
--     lib/studioCloisonnement.test.ts garde cette frontière.
--
-- AUCUNE COLONNE N'EST SUPPRIMÉE.

-- ── Un coloris suivi par le Studio ───────────────────────────────────────────
-- `cle` vient de SacBase ("5039-black-pink") : c'est lui qui sait quel coloris
-- porte un SKU. Unique par compte, donc deux comptes peuvent suivre le même
-- coloris sans se voir.
CREATE TABLE "public"."StudioColoris" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cle" TEXT NOT NULL,
    "modele" TEXT NOT NULL,
    "coloris" TEXT NOT NULL,
    -- Détails à préserver, un par ligne. Servent au prompt ET à la grille de
    -- vérification : c'est la même liste des deux côtés, volontairement.
    "details" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudioColoris_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudioColoris_userId_cle_key" ON "public"."StudioColoris"("userId", "cle");
CREATE INDEX "StudioColoris_userId_idx" ON "public"."StudioColoris"("userId");

ALTER TABLE "public"."StudioColoris"
    ADD CONSTRAINT "StudioColoris_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Une vraie photo de référence ─────────────────────────────────────────────
-- JAMAIS une image générée : celles-ci vivent dans StudioEssai, et les deux
-- préfixes du Blob sont distincts (references/ et generees/).
CREATE TABLE "public"."StudioReference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    -- Nullable : SacBase injoignable ou SKU inconnu au moment du chargement. La
    -- photo est gardée « non rattachée » et reliée au prochain passage. Ce n'est
    -- pas une erreur, c'est le cas normal quand la synchro tombe.
    "colorisId" TEXT,
    "sku" TEXT,
    "origine" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "urlImage" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudioReference_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StudioReference_userId_idx" ON "public"."StudioReference"("userId");
CREATE INDEX "StudioReference_colorisId_idx" ON "public"."StudioReference"("colorisId");
CREATE INDEX "StudioReference_sku_idx" ON "public"."StudioReference"("sku");

ALTER TABLE "public"."StudioReference"
    ADD CONSTRAINT "StudioReference_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL, pas CASCADE : une vraie photo se conserve sans limite (spec §8).
-- Abandonner un coloris ne doit pas détruire des photos qu'on ne reprendra pas.
ALTER TABLE "public"."StudioReference"
    ADD CONSTRAINT "StudioReference_colorisId_fkey" FOREIGN KEY ("colorisId")
    REFERENCES "public"."StudioColoris"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Un modèle d'angle, éditable ──────────────────────────────────────────────
CREATE TABLE "public"."StudioAngle" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "roleReference" TEXT NOT NULL,
    "angle" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudioAngle_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StudioAngle_userId_ordre_idx" ON "public"."StudioAngle"("userId", "ordre");

ALTER TABLE "public"."StudioAngle"
    ADD CONSTRAINT "StudioAngle_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Un essai : une image générée, sa note et la décision d'Aramis ────────────
CREATE TABLE "public"."StudioEssai" (
    "id" TEXT NOT NULL,
    "colorisId" TEXT NOT NULL,
    "angleId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    -- 'manuel' aujourd'hui (génération dans l'application Gemini), 'api' demain
    -- si l'option B arrive. Le modèle de données ne bougera pas pour ça (§2).
    "source" TEXT NOT NULL DEFAULT 'manuel',
    "promptUtilise" TEXT NOT NULL,
    "urlImage" TEXT NOT NULL,
    "verifIA" JSONB,
    -- 'valide' | 'rejete' | NULL. C'est CETTE colonne qui alimente les
    -- statistiques, pas verifIA : le verdict du modèle n'est qu'une aide (§6).
    "decision" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudioEssai_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StudioEssai_colorisId_idx" ON "public"."StudioEssai"("colorisId");
CREATE INDEX "StudioEssai_angleId_idx" ON "public"."StudioEssai"("angleId");
CREATE UNIQUE INDEX "StudioEssai_colorisId_angleId_numero_key" ON "public"."StudioEssai"("colorisId", "angleId", "numero");

ALTER TABLE "public"."StudioEssai"
    ADD CONSTRAINT "StudioEssai_colorisId_fkey" FOREIGN KEY ("colorisId")
    REFERENCES "public"."StudioColoris"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RESTRICT, pas CASCADE : supprimer un modèle d'angle effacerait les mesures
-- qui sont le but même du test (§11). Un angle qui a servi se garde.
ALTER TABLE "public"."StudioEssai"
    ADD CONSTRAINT "StudioEssai_angleId_fkey" FOREIGN KEY ("angleId")
    REFERENCES "public"."StudioAngle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
