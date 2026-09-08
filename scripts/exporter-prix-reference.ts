// Relève les prix de référence AVANT la migration qui détruit leur table.
//
// Le report vers les prompts est MANUEL (cf. spec §7) : plusieurs prompts
// peuvent correspondre à un même prix, et deviner lequel choisir serait pire
// que de ne rien faire. Ce script ne décide donc rien — il imprime, pour
// qu'Aramis ressaisisse les prix dans /parametres après la migration.
//
// Lecture seule. N'écrit rien en base.
//
//   npx tsx scripts/exporter-prix-reference.ts
import { writeFileSync } from "node:fs";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";

// Sans ce chargement, DATABASE_URL n'est pas lue : `.env` n'est pas injecté
// automatiquement hors du runtime Next (même parti que migrer-trello-env.ts).
loadEnvConfig(process.cwd());

const prisma = new PrismaClient();
const SORTIE = "docs/audits/2026-09-08-prix-reference-avant-migration.md";

async function main() {
  const refs = await prisma.prixReference.findMany({
    orderBy: [{ estDefaut: "desc" }, { marque: "asc" }, { categorie: "asc" }],
    include: { user: { select: { email: true } } },
  });

  const doc = [
    "# Prix de référence, relevés avant leur suppression",
    "",
    "Généré par `scripts/exporter-prix-reference.ts` le 2026-09-08 sur la base",
    "**dev**, juste avant la migration `20260908120000_prix_dans_prompt_delai_par_lot`,",
    "qui détruit la table `PrixReference`.",
    "",
    "Le report vers `PromptTemplate.prixReference` est **manuel** : plusieurs",
    "prompts peuvent correspondre à un même prix, la migration ne peut pas",
    "choisir. Cette page est la seule trace qui reste de ces valeurs.",
    "",
    `${refs.length} ligne(s).`,
    "",
    "| Compte | Marque | Catégorie | Prix (€) | Défaut |",
    "|---|---|---|---|---|",
    ...refs.map(
      (r) =>
        `| ${r.user.email} | ${r.marque ?? "*toutes*"} | ${r.categorie ?? "*toutes*"} | ${r.prix} | ${r.estDefaut ? "oui" : "non"} |`,
    ),
    "",
  ].join("\n");

  writeFileSync(SORTIE, doc, "utf8");
  console.log(doc);
  console.log(`\n→ écrit dans ${SORTIE}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
