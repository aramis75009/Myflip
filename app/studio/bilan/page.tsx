import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { CardTitle, Eyebrow, Frame, Module } from "@/components/console";
import { getCatalogue } from "@/lib/studioCatalogue";
import { MODELE_MANUEL } from "@/lib/studioFiche";
import { formatUsd } from "@/lib/studioModeles";
import { chargerBilan } from "@/lib/studioServeur";
import { computeStudioStats, type FirstTryStat, type GroupStat, type ModelStat } from "@/lib/studioStats";

export const dynamic = "force-dynamic";

// /studio/bilan — les mesures du test (spec §3 étape 8, §11). Calculées sur la
// décision d'Aramis, jamais sur le verdict IA (spec §6).

const pct = (t: FirstTryStat) => (t.rate === null ? "—" : `${Math.round(t.rate * 100)} %`);
const moy = (v: number | null) => (v === null ? "—" : v.toLocaleString("fr-FR", { maximumFractionDigits: 1 }));

export default async function BilanPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const [{ essais, echecs, angles, coloris }, catalogue] = await Promise.all([chargerBilan(userId), getCatalogue()]);
  const stats = computeStudioStats(essais, echecs);
  const nomModele = new Map(catalogue.modeles.map((m) => [m.id, m.nom]));
  // Le meilleur rapport qualité/prix d'abord : coût par image validée croissant,
  // les modèles sans ce chiffre (aucun validé, ou coût inconnu) à la fin.
  const byModel = [...stats.byModel].sort(
    (a, b) => (a.coutParValideeUsd ?? Infinity) - (b.coutParValideeUsd ?? Infinity) || (a.id < b.id ? -1 : 1),
  );
  const nomAngle = new Map(angles.map((a) => [a.id, a.nom]));
  const ordreAngle = new Map(angles.map((a) => [a.id, a.ordre]));
  const parColoris = new Map(coloris.map((c) => [c.id, c]));
  const decides = essais.filter((e) => e.decision === "valide" || e.decision === "rejete").length;

  const byAngle = [...stats.byAngle].sort((a, b) => (ordreAngle.get(a.id) ?? 0) - (ordreAngle.get(b.id) ?? 0));

  return (
    <Frame>
      <Module>
        <div className="flex flex-wrap items-end gap-8">
          <Chiffre libelle="RÉUSSITE AU 1ER ESSAI" valeur={pct(stats.global.firstTry)} sous={`${stats.global.firstTry.validated}/${stats.global.firstTry.decided} premiers essais décidés`} />
          <Chiffre libelle="ESSAIS MOYENS PAR ANGLE" valeur={moy(stats.global.averageTries)} sous={`${stats.global.pairs} couple(s) coloris × angle`} />
          <Chiffre libelle="ESSAIS" valeur={String(essais.length)} sous={`${decides} décidé(s) · ${echecs.length} échec(s)`} />
          <Chiffre
            libelle="TOTAL DÉPENSÉ"
            valeur={formatUsd(stats.depense.totalUsd)}
            sous={
              stats.depense.essaisSansCout > 0
                ? `au moins — ${stats.depense.essaisSansCout} essai(s) sans coût connu`
                : "coût réel renvoyé par OpenRouter"
            }
          />
        </div>
        <p className="mt-3 text-sm text-ink-2">
          Taux et moyennes comptent tes décisions (Valider / Rejeter), pas le verdict du modèle de vision. Un essai
          sans décision n’entre dans aucun chiffre.
        </p>
      </Module>

      <Module>
        <CardTitle aside="TRIÉ PAR COÛT PAR IMAGE VALIDÉE">Par modèle</CardTitle>
        <TableModeles lignes={byModel} libelle={(id) => (id === MODELE_MANUEL ? "Dépôt manuel" : (nomModele.get(id) ?? id))} />
        <p className="mt-2 text-xs text-ink-2">
          « ≥ » : au moins un essai du modèle n’a pas de coût connu, le chiffre est un minimum. Un coût inconnu
          n’est jamais compté zéro. Les échecs ne consomment pas de numéro d’essai.
        </p>
      </Module>

      <div className="grid grid-cols-2 gap-3.5">
        <Module>
          <CardTitle>Par angle</CardTitle>
          <TableStats lignes={byAngle} libelle={(id) => nomAngle.get(id) ?? "Angle supprimé"} />
        </Module>
        <Module>
          <CardTitle>Par coloris</CardTitle>
          <TableStats
            lignes={stats.byColoris}
            libelle={(id) => {
              const c = parColoris.get(id);
              return c ? (
                <Link href={`/studio/${encodeURIComponent(c.cle)}`} className="hover:underline">
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
        <CardTitle aside="SELON LE CONTRÔLE IA">Détails qui dérivent le plus</CardTitle>
        {stats.topDriftingDetails.length === 0 ? (
          <p className="text-sm text-ink-2">Aucun détail marqué « dérive » pour l’instant.</p>
        ) : (
          <ol className="flex flex-col gap-1.5 text-base">
            {stats.topDriftingDetails.map((d, i) => (
              <li key={d.detail} className="flex gap-3">
                <span className="font-mono text-ink-3">{i + 1}.</span>
                <span className="font-semibold">{d.detail}</span>
                <span className="text-ink-2">{d.count} essai(s)</span>
              </li>
            ))}
          </ol>
        )}
      </Module>
    </Frame>
  );
}

function Chiffre({ libelle, valeur, sous }: { libelle: string; valeur: string; sous: string }) {
  return (
    <div>
      <Eyebrow>{libelle}</Eyebrow>
      <div className="mt-1 text-xl font-bold tracking-[-0.02em]">{valeur}</div>
      <div className="text-xs text-ink-2">{sous}</div>
    </div>
  );
}

function TableStats({ lignes, libelle }: { lignes: GroupStat[]; libelle: (id: string) => React.ReactNode }) {
  if (lignes.length === 0) return <p className="text-sm text-ink-2">Aucun essai.</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left font-mono text-xs tracking-[0.1em] text-ink-3">
          <th className="pb-2 font-normal"> </th>
          <th className="pb-2 text-right font-normal">1ER ESSAI</th>
          <th className="pb-2 text-right font-normal">ESSAIS MOY.</th>
        </tr>
      </thead>
      <tbody>
        {lignes.map((l) => (
          <tr key={l.id} className="border-t border-line">
            <td className="py-2 font-semibold">{libelle(l.id)}</td>
            <td className="py-2 text-right font-mono">
              {pct(l.firstTry)} <span className="text-ink-3">({l.firstTry.validated}/{l.firstTry.decided})</span>
            </td>
            <td className="py-2 text-right font-mono">{moy(l.averageTries)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TableModeles({ lignes, libelle }: { lignes: ModelStat[]; libelle: (id: string) => string }) {
  if (lignes.length === 0) return <p className="text-sm text-ink-2">Aucun essai.</p>;
  const cout = (v: number | null, incomplet: boolean) => (v === null ? "—" : `${incomplet ? "≥ " : ""}${formatUsd(v)}`);
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left font-mono text-xs tracking-[0.1em] text-ink-3">
          <th className="pb-2 font-normal"> </th>
          <th className="pb-2 text-right font-normal">1ER ESSAI</th>
          <th className="pb-2 text-right font-normal">ESSAIS MOY.</th>
          <th className="pb-2 text-right font-normal">COÛT MOY.</th>
          <th className="pb-2 text-right font-normal">COÛT / VALIDÉE</th>
          <th className="pb-2 text-right font-normal">SCORE IA</th>
          <th className="pb-2 text-right font-normal">ÉCHECS</th>
        </tr>
      </thead>
      <tbody>
        {lignes.map((l) => (
          <tr key={l.id} className="border-t border-line">
            <td className="py-2 font-semibold">
              {libelle(l.id)}
              <span className="ml-2 font-mono text-xs font-normal text-ink-3">
                {l.essais} essai(s) · {l.validated} validé(s)
              </span>
            </td>
            <td className="py-2 text-right font-mono">
              {pct(l.firstTry)} <span className="text-ink-3">({l.firstTry.validated}/{l.firstTry.decided})</span>
            </td>
            <td className="py-2 text-right font-mono">{moy(l.averageTries)}</td>
            <td className="py-2 text-right font-mono">{cout(l.coutMoyenUsd, l.coutIncomplet)}</td>
            <td className="py-2 text-right font-mono font-semibold">{cout(l.coutParValideeUsd, l.coutIncomplet)}</td>
            <td className="py-2 text-right font-mono">{l.scoreMoyen ?? "—"}</td>
            <td className="py-2 text-right font-mono">
              {l.echecs}
              {l.blocagesSecurite > 0 && <span className="text-neg"> · {l.blocagesSecurite} sécu.</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
