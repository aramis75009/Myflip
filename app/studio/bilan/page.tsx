import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { CardTitle, Eyebrow, Frame, Module } from "@/components/console";
import { pluriel } from "@/lib/format";
import { getCatalogue } from "@/lib/studioCatalogue";
import { MODELE_MANUEL, modeleDe } from "@/lib/studioFiche";
import { formatEur, formatUsd, usdEnEur } from "@/lib/studioModeles";
import { chargerBilan, lireBudget } from "@/lib/studioServeur";
import { computeStudioStats } from "@/lib/studioStats";

import { depensesParSemaine, statsGlobales, statsParGroupe, type StatGroupe } from "../_bilan";
import { Barre, ColonnesSemaines } from "./_graphiques";

export const dynamic = "force-dynamic";

// /studio/bilan — what the Studio produced and cost. Rates come from
// Aramis's DECISIONS only (never the AI opinion), with the same definition of
// a first try as the model picker (app/studio/_bilan.ts). An unknown real cost
// is never counted as zero: totals carry « ≥ » and say what they miss.

const pct = (t: number | null) => (t === null ? "—" : `${Math.round(t * 100)} %`);

export default async function BilanPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const [{ essais, echecs, angles, coloris }, catalogue, budget] = await Promise.all([chargerBilan(userId), getCatalogue(), lireBudget(userId)]);
  const taux = budget.tauxEurParUsd;
  const enEur = (usd: number) => usdEnEur(usd, taux) ?? 0;
  const nomModele = new Map(catalogue.modeles.map((m) => [m.id, m.nom]));
  const libelleModele = (id: string) => (id === MODELE_MANUEL ? "Dépôt manuel (Gemini)" : (nomModele.get(id) ?? id));

  const global = statsGlobales(essais);
  const { depense, topDriftingDetails } = computeStudioStats(essais, echecs);
  const semaines = depensesParSemaine(essais, echecs, new Date(), 12);

  // Per model: the best value for money first (cost per validated image), then success.
  const echecsParModele = new Map<string, { n: number; securite: number }>();
  for (const x of echecs) {
    const k = modeleDe(x.modele);
    const v = echecsParModele.get(k) ?? { n: 0, securite: 0 };
    v.n++;
    if (x.code === "securite") v.securite++;
    echecsParModele.set(k, v);
  }
  const parModele = statsParGroupe(essais, (e) => modeleDe(e.modele));
  // A model with failures only keeps its row: it is the one to see blocked.
  for (const id of echecsParModele.keys()) if (!parModele.some((g) => g.id === id)) parModele.push({ ...statsGlobales([]), id });
  parModele.sort(
    (a, b) =>
      (a.coutParValideeUsd ?? Infinity) - (b.coutParValideeUsd ?? Infinity) ||
      (b.taux ?? -1) - (a.taux ?? -1) ||
      (a.id < b.id ? -1 : 1),
  );
  const maxParValidee = Math.max(0, ...parModele.map((g) => g.coutParValideeUsd ?? 0));

  // Changing an angle's text archives the old version: both rows keep their own results, the old one says so.
  const nomAngle = new Map(angles.map((a) => [a.id, a.archiveLe ? `${a.nom} · ancienne version` : a.nom]));
  const ordreAngle = new Map(angles.map((a) => [a.id, a.ordre]));
  const parAngle = statsParGroupe(essais, (e) => e.angleId).sort((a, b) => (ordreAngle.get(a.id) ?? 0) - (ordreAngle.get(b.id) ?? 0));
  const parColorisId = new Map(coloris.map((c) => [c.id, c]));
  const parColoris = statsParGroupe(essais, (e) => e.colorisId).sort((a, b) => b.images - a.images || (a.id < b.id ? -1 : 1));

  const minimum = depense.essaisSansCout > 0 ? "≥ " : "";
  const coutParValidee = global.valides > 0 && depense.totalUsd > 0 ? depense.totalUsd / global.valides : null;

  return (
    <Frame>
      <Module>
        <div className="flex flex-wrap items-end gap-x-10 gap-y-5">
          <div>
            <Eyebrow>RÉUSSITE AU 1ER ESSAI</Eyebrow>
            <div className="mt-1 text-2xl font-bold tracking-[-0.02em] text-ink">{pct(global.taux)}</div>
            <div className="text-sm text-ink-2">
              {global.premiersDecides > 0
                ? `${global.premiersValides}/${global.premiersDecides} premiers coups validés`
                : "aucun premier coup décidé"}
            </div>
          </div>
          <Chiffre
            libelle="DÉPENSÉ"
            valeur={`${minimum}${formatEur(enEur(depense.totalUsd))}`}
            sous={
              depense.essaisSansCout > 0
                ? `${formatUsd(depense.totalUsd)} · ${pluriel(depense.essaisSansCout, "image sans coût connu", "images sans coût connu")}`
                : `${formatUsd(depense.totalUsd)}, coût réel OpenRouter`
            }
          />
          <Chiffre
            libelle="COÛT PAR IMAGE VALIDÉE"
            valeur={coutParValidee === null ? "—" : `${minimum}${formatEur(enEur(coutParValidee))}`}
            sous={global.valides > 0 ? pluriel(global.valides, "image validée", "images validées") : "aucune image validée"}
          />
          <Chiffre
            libelle="IMAGES"
            valeur={String(global.images)}
            sous={`${global.valides} validée${global.valides > 1 ? "s" : ""} · ${global.rejetes} rejetée${global.rejetes > 1 ? "s" : ""} · ${global.aJuger} à juger`}
          />
          <Chiffre
            libelle="ÉCHECS"
            valeur={String(echecs.length)}
            sous={(() => {
              const s = echecs.filter((x) => x.code === "securite").length;
              return s > 0 ? pluriel(s, "blocage de sécurité", "blocages de sécurité") : "générations sans image";
            })()}
          />
        </div>
        <p className="mt-4 max-w-[80ch] text-sm text-ink-2">
          Les taux comptent tes décisions (Valider, Rejeter, ou ton choix dans une comparaison), jamais l’avis de l’IA. Un premier coup est
          une image qui n’est pas une correction. Montants au taux de {String(taux).replace(".", ",")} € pour 1 $.
        </p>
      </Module>

      <Module>
        <CardTitle aside="12 DERNIÈRES SEMAINES · COÛT RÉEL">Dépenses par semaine</CardTitle>
        <ColonnesSemaines semaines={semaines} taux={taux} />
      </Module>

      <Module>
        <CardTitle aside="TRIÉ PAR COÛT PAR IMAGE VALIDÉE">Par modèle</CardTitle>
        {parModele.length === 0 ? (
          <p className="text-sm text-ink-2">Aucun essai.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-3">
                  <th scope="col" className="pb-2 font-medium">
                    Modèle
                  </th>
                  <th scope="col" className="w-[30%] pb-2 font-medium">
                    Réussite du 1er coup
                  </th>
                  <th scope="col" className="w-[30%] pb-2 font-medium">
                    Coût par image validée
                  </th>
                  <th scope="col" className="pb-2 text-right font-medium">
                    Dépensé
                  </th>
                </tr>
              </thead>
              <tbody>
                {parModele.map((g) => {
                  const x = echecsParModele.get(g.id);
                  const manuel = g.id === MODELE_MANUEL;
                  return (
                    <tr key={g.id} className="border-t border-line align-middle">
                      <th scope="row" className="py-2.5 pr-4 text-left font-normal">
                        <span className="block font-semibold text-ink">{libelleModele(g.id)}</span>
                        <span className="block text-xs text-ink-2">
                          {g.images === 0
                            ? "aucune image"
                            : `${pluriel(g.images, "image", "images")} · ${g.valides} validée${g.valides > 1 ? "s" : ""} · ${g.rejetes} rejetée${g.rejetes > 1 ? "s" : ""}`}
                          {x ? ` · ${pluriel(x.n, "échec", "échecs")}${x.securite > 0 ? ` (${x.securite} sécurité)` : ""}` : ""}
                        </span>
                      </th>
                      <td className="py-2.5 pr-4">
                        <Barre
                          part={g.taux}
                          libelle={g.taux === null ? "non jugé" : `${pct(g.taux)} · ${g.premiersValides}/${g.premiersDecides}`}
                          etiquette={g.taux === null ? "Aucun premier coup décidé" : `${pct(g.taux)} de réussite au premier coup`}
                        />
                      </td>
                      <td className="py-2.5 pr-4">
                        {manuel ? (
                          <span className="text-xs text-ink-2">à la main, sans coût API</span>
                        ) : (
                          <Barre
                            part={g.coutParValideeUsd === null || maxParValidee === 0 ? null : g.coutParValideeUsd / maxParValidee}
                            libelle={
                              g.coutParValideeUsd === null ? "—" : `${g.sansCout > 0 ? "≥ " : ""}${formatEur(enEur(g.coutParValideeUsd))}`
                            }
                            etiquette={
                              g.coutParValideeUsd === null
                                ? "Pas de coût par image validée : aucune validée ou aucun coût connu"
                                : `${formatEur(enEur(g.coutParValideeUsd))} par image validée`
                            }
                          />
                        )}
                      </td>
                      <td className="py-2.5 text-right font-mono tabular-nums text-ink">{depenseModele(g, manuel, enEur)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-ink-2">
          « ≥ » : au moins une image du modèle n’a pas de coût réel connu, le montant est un minimum. Barre en pointillé : pas encore de
          valeur. Les échecs ne comptent pas dans les images.
        </p>
      </Module>

      <div className="grid gap-3.5 min-[1100px]:grid-cols-2">
        <Module>
          <CardTitle aside="RÉUSSITE DU 1ER COUP">Par angle</CardTitle>
          <ListeTaux lignes={parAngle} libelle={(id) => nomAngle.get(id) ?? "Angle supprimé"} />
        </Module>
        <Module>
          <CardTitle aside="RÉUSSITE DU 1ER COUP">Par coloris</CardTitle>
          <ListeTaux
            lignes={parColoris}
            libelle={(id) => {
              const c = parColorisId.get(id);
              return c ? (
                <Link href={`/studio/${encodeURIComponent(c.cle)}`} className="rounded-xs hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
                  {c.modele} {c.coloris}
                </Link>
              ) : (
                id
              );
            }}
          />
        </Module>
      </div>

      <Module>
        <CardTitle aside="SELON L’AVIS DE L’IA">Détails qui dérivent le plus</CardTitle>
        {topDriftingDetails.length === 0 ? (
          <p className="text-sm text-ink-2">Aucun détail marqué « dérive » pour l’instant.</p>
        ) : (
          <ol className="flex flex-col gap-1.5 text-base">
            {topDriftingDetails.map((d, i) => (
              <li key={d.detail} className="flex gap-3">
                <span className="font-mono text-ink-3">{i + 1}.</span>
                <span className="font-semibold text-ink">{d.detail}</span>
                <span className="text-ink-2">{pluriel(d.count, "image", "images")}</span>
              </li>
            ))}
          </ol>
        )}
      </Module>
    </Frame>
  );
}

/** What a model cost: « — » without image, « inconnu » when no real cost is known (never « 0,00 € »), « ≥ » when partial. */
function depenseModele(g: StatGroupe, manuel: boolean, enEur: (usd: number) => number): string {
  if (manuel || g.images === 0) return "—";
  if (g.coutConnuUsd === 0 && g.sansCout > 0) return "inconnu";
  return `${g.sansCout > 0 ? "≥ " : ""}${formatEur(enEur(g.coutConnuUsd))}`;
}

function Chiffre({ libelle, valeur, sous }: { libelle: string; valeur: string; sous: string }) {
  return (
    <div>
      <Eyebrow>{libelle}</Eyebrow>
      <div className="mt-1 text-xl font-bold tracking-[-0.02em] text-ink">{valeur}</div>
      <div className="text-sm text-ink-2">{sous}</div>
    </div>
  );
}

function ListeTaux({ lignes, libelle }: { lignes: StatGroupe[]; libelle: (id: string) => React.ReactNode }) {
  if (lignes.length === 0) return <p className="text-sm text-ink-2">Aucun essai.</p>;
  return (
    <ul className="flex flex-col gap-2.5">
      {lignes.map((l) => (
        <li key={l.id} className="grid grid-cols-[minmax(0,12rem)_minmax(0,1fr)] items-center gap-3">
          <span className="min-w-0 text-sm">
            <span className="block truncate font-semibold text-ink">{libelle(l.id)}</span>
            <span className="block text-xs text-ink-2">
              {l.images} image{l.images > 1 ? "s" : ""}
              {l.aJuger > 0 ? ` · ${l.aJuger} à juger` : ""}
            </span>
          </span>
          <Barre
            part={l.taux}
            libelle={l.taux === null ? "non jugé" : `${pct(l.taux)} · ${l.premiersValides}/${l.premiersDecides}`}
            etiquette={l.taux === null ? "Aucun premier coup décidé" : `${pct(l.taux)} de réussite au premier coup`}
          />
        </li>
      ))}
    </ul>
  );
}
