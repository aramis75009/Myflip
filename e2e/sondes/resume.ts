/**
 * Résumé lisible de e2e/rapports/<serie>/sondes.json et a11y.json.
 *
 *   npx tsx e2e/sondes/resume.ts                 # série par défaut (CAPTURES_SERIE, sinon « courant »)
 *   CAPTURES_SERIE=avant npx tsx e2e/sondes/resume.ts
 *   npx tsx e2e/sondes/resume.ts --detail F1     # + les mesures brutes d'une sonde
 *
 * Lecture seule : ne démarre rien, n'écrit rien.
 */
import { lireA11y, lireSondes } from "./resultats";

const detail = process.argv.includes("--detail") ? process.argv[process.argv.indexOf("--detail") + 1] : null;

const sondes = lireSondes();
const cumul = { "bug présent": 0, "corrigé": 0, "non mesurable": 0 } as Record<string, number>;
for (const s of sondes) cumul[s.etat] = (cumul[s.etat] ?? 0) + 1;

console.log(`Sondes : ${sondes.length} résultats — bug présent ${cumul["bug présent"]}, corrigé ${cumul["corrigé"]}, non mesurable ${cumul["non mesurable"]}`);
const parId = new Map<string, typeof sondes>();
for (const s of sondes) parId.set(s.id, [...(parId.get(s.id) ?? []), s]);
for (const [id, liste] of parId) {
  const etats = liste.map((s) => (s.etat === "bug présent" ? "B" : s.etat === "corrigé" ? "ok" : "??")).join(" ");
  console.log(`${id.padEnd(4)} ${String(liste.length).padStart(3)} résultat(s)  ${etats.length > 80 ? etats.slice(0, 80) + "…" : etats}  ${liste[0].titre}`);
}
if (detail) {
  for (const s of sondes.filter((x) => x.id === detail)) {
    console.log(`\n${s.id} · ${s.projet} · ${s.route} · ${s.etat}\n${JSON.stringify(s.mesure, null, 1)}`);
  }
}

const a11y = lireA11y();
if (a11y.length > 0) {
  const graves = a11y.filter((a) => a.graves > 0).length;
  console.log(`\nAccessibilité : ${a11y.length} page(s) mesurée(s), ${graves} avec au moins une violation serious ou critical`);
}
