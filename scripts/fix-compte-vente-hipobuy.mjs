// Correction ponctuelle : les sacs Hipobuy déjà vendus passent sur Enorab18
// (VINTED_SECOND), le compte où Aramis publie les sacs. Un backfill antérieur
// (backfill-compte-vente.mjs) les avait tous mis sur VINTED_PRO par défaut.
//
// Usage : node --env-file=.env scripts/fix-compte-vente-hipobuy.mjs [--apply]
//
// SIMULATION par défaut : liste les articles visés et leur compte actuel, sans
// rien écrire. `--apply` écrit. Cible : le compte de SACBASE_USER_EMAIL, ses
// articles « Vendu » dont la commande a un fournisseur contenant « hipobuy ».
import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const email = process.env.SACBASE_USER_EMAIL?.trim().toLowerCase();
if (!email) {
  console.error("SACBASE_USER_EMAIL absent : impossible de savoir quel compte corriger.");
  process.exit(1);
}

// La base visée, sans les identifiants : lancer ce script sur la mauvaise base
// est l'erreur la plus probable, elle doit se lire avant toute écriture.
const hote = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").host || "(DATABASE_URL absente)";
  } catch {
    return "(DATABASE_URL illisible)";
  }
})();

const prisma = new PrismaClient();
try {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) {
    console.error(`Aucun compte MyFlip pour ${email} sur ${hote}.`);
    process.exit(1);
  }

  const where = {
    userId: user.id,
    statut: "Vendu",
    commande: { fournisseur: { contains: "hipobuy", mode: "insensitive" } },
  };
  const articles = await prisma.article.findMany({
    where,
    select: { sku: true, compteVente: true, prixVente: true, dateVente: true },
  });
  articles.sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true }));

  console.log(`Base : ${hote} · compte : ${email}`);
  console.log(`${articles.length} sac(s) Hipobuy vendu(s) :`);
  for (const a of articles) {
    const date = a.dateVente ? a.dateVente.toISOString().slice(0, 10) : "—";
    console.log(`  ${a.sku.padEnd(7)} ${String(a.prixVente ?? "—").padStart(5)} €  ${date}  ${a.compteVente ?? "(aucun)"} → VINTED_SECOND`);
  }

  if (!APPLY) {
    console.log("\nSIMULATION — rien n'a été écrit. Relancer avec --apply pour appliquer.");
  } else if (articles.length) {
    const r = await prisma.article.updateMany({ where, data: { compteVente: "VINTED_SECOND" } });
    console.log(`\n${r.count} article(s) passé(s) sur VINTED_SECOND (Enorab18).`);
  }
} finally {
  await prisma.$disconnect();
}
