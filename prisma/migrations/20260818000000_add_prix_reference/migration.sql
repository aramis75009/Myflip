-- CreateTable PrixReference
CREATE TABLE "PrixReference" (
    "id" TEXT NOT NULL,
    "marque" TEXT,
    "categorie" TEXT,
    "prix" DOUBLE PRECISION NOT NULL,
    "estDefaut" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "PrixReference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrixReference_userId_idx" ON "PrixReference"("userId");

-- CreateIndex
CREATE INDEX "PrixReference_userId_estDefaut_idx" ON "PrixReference"("userId", "estDefaut");

-- CreateIndex
CREATE INDEX "PrixReference_marque_idx" ON "PrixReference"("marque");

-- CreateIndex
CREATE INDEX "PrixReference_categorie_idx" ON "PrixReference"("categorie");

-- AddForeignKey
ALTER TABLE "PrixReference" ADD CONSTRAINT "PrixReference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
