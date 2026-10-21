"use client";
// design-tokens-dette: R10 R12 → M6

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useCommandes, useStats } from "@/lib/hooks";
import { coefLabel, euros, pct1 } from "@/lib/calc";
import type {
  CanalCA,
  CommandeDTO,
  StatsBrandRow,
  StatutCount,
  TopArticle,
  WeekdayPoint,
} from "@/lib/types";
import { statutColor } from "@/lib/statutColors";
import { canalColor } from "@/lib/canalColors";
import { CardTitle, Eyebrow, Frame } from "@/components/console";
import Loader from "@/components/Loader";

// ─────────────────────────────────────────────────────────────────────────
// Statistiques — langage visuel « Direction C — Console tactile ».
//
// Conventions héritées du Dashboard : valeurs arbitraires relevées sur la
// maquette (la demi-pixellisation 10,5 / 12,5 / 9,5 n'existe pas dans
// l'échelle Tailwind), bascule des grilles à `min-[900px]:` comme la maquette
// et non à `md:`.
//
// ── Agencement ───────────────────────────────────────────────────────────
// La page se lit en cinq bandes, du contexte vers le détail :
//
//   1. PÉRIMÈTRE   le sujet de la page : de quoi parlent tous les chiffres
//   2. ARGENT      CA, vitesse, projection — trois cartes courtes
//   3. FORME       meilleur jour, répartition des statuts — deux graphes
//   4. MARQUES     le classement analytique, pleine largeur
//   5. TOP 5       les meilleures ventes, cinq cartes
//
// Les bandes 4 et 5 sont en pleine largeur *par construction* : ce sont les
// blocs dont la hauteur dépend du volume de données (10 marques ici, 6 dans
// la maquette), et les mettre côte à côte garantissait un trou sous le plus
// court. Les bandes 2 et 3 n'ont pas ce problème — hauteurs bornées.
//
// ── Écarts assumés vis-à-vis de la maquette ──────────────────────────────
//   · le graphe « Meilleur jour » compte des VENTES, pas des euros : c'est ce
//     que cette carte mesure depuis toujours ;
//   · une ligne d'alerte s'ajoute sous la projection au-delà d'un an ;
//   · les tableaux passent en cartes sous 900px (CLAUDE.md : jamais de
//     tableau sur mobile) — la maquette, elle, les fait défiler.
// ─────────────────────────────────────────────────────────────────────────

const TOUT_HISTORIQUE = "Tout l’historique";

// Le vide se dit d'une seule façon sur cet écran, quel que soit le bloc.
const AUCUNE_VENTE = "AUCUNE VENTE SUR LE PÉRIMÈTRE";

// « 10 juin 2026 »
const dateLongue = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

const frNum = (n: number, d = 1) =>
  n.toLocaleString("fr-FR", { maximumFractionDigits: d });

// Pilule mono sur fond creusé — le jeton de fait de Direction C (cf. la carte
// « TOTAL INVESTI » de l'écran Commandes : 14 COMMANDES, 1 243 PIÈCES…).
function Fact({ children }: { children: React.ReactNode }) {
  return (
    <span className="whitespace-nowrap rounded-full bg-surface-2 px-[13px] py-[7px] font-mono text-xs text-ink-2">
      {children}
    </span>
  );
}

function Empty({ children = AUCUNE_VENTE }: { children?: string }) {
  return (
    <div className="py-6 text-center font-mono text-xs text-ink-3">
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Bande 1 — Périmètre
//
// C'est le sujet de la page : tout ce qui suit est « de » ce périmètre. Le
// nom du périmètre EST le déclencheur du menu — il n'y a donc plus ni libellé
// « Basé sur… » qui répétait le bouton, ni contrôle orphelin à l'autre bout
// d'une ligne vide. Les jetons de droite disent ce que ce périmètre contient,
// information qui manquait entièrement dès qu'on choisissait une commande.
// ─────────────────────────────────────────────────────────────────────────

function ScopeBar({
  commandes,
  commandeId,
  onSelect,
  facts,
}: {
  commandes: CommandeDTO[];
  commandeId: string | null;
  onSelect: (id: string | null) => void;
  facts: string[];
}) {
  const [open, setOpen] = useState(false);
  const selected = commandes.find((c) => c.id === commandeId) ?? null;
  const nom = selected ? selected.fournisseur : TOUT_HISTORIQUE;

  return (
    <section className="rounded-lg border border-line bg-surface p-[22px]">
      <div className="flex flex-wrap items-end justify-between gap-x-5 gap-y-3.5">
        <div className="relative min-w-0">
          <Eyebrow>PÉRIMÈTRE D’ANALYSE</Eyebrow>
          {open && (
            <div className="fixed inset-0 z-overlay" onClick={() => setOpen(false)} />
          )}
          <button
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-haspopup="listbox"
            className="group relative z-popover mt-1 flex min-h-11 max-w-full items-center gap-2.5 text-left"
          >
            <span className="truncate text-xl font-bold tracking-[-0.03em] text-ink transition-colors group-hover:text-accent-text">
              {nom}
            </span>
            <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full border border-line bg-surface-2 transition-colors group-hover:border-line-strong">
              <ChevronDown
                className={`h-3.5 w-3.5 text-ink-2 transition-transform ${open ? "rotate-180" : ""}`}
                strokeWidth={2}
              />
            </span>
          </button>
          {/* Sous-titre du périmètre : la date distingue les commandes d'un
              même fournisseur, cinq d'entre elles portant le même nom. */}
          <div className="mt-0.5 font-mono text-xs text-ink-3">
            {selected
              ? `${dateLongue(selected.date)} · ${frNum(selected.prixUnitaire, 2)} € LA PIÈCE EN MOYENNE`
              : "TOUTES COMMANDES CONFONDUES"}
          </div>

          {open && (
            <div
              role="listbox"
              className="absolute left-0 top-full z-popover mt-2 max-h-[340px] w-[300px] overflow-y-auto rounded-lg border border-line bg-surface py-1.5 shadow-pop"
            >
              <ScopeOption
                label={TOUT_HISTORIQUE}
                sub="TOUTES COMMANDES CONFONDUES"
                active={commandeId === null}
                onClick={() => {
                  onSelect(null);
                  setOpen(false);
                }}
              />
              {commandes.map((c) => (
                <ScopeOption
                  key={c.id}
                  label={c.fournisseur}
                  sub={`${dateLongue(c.date)} · ${c.nbArticles} ART.`}
                  active={commandeId === c.id}
                  onClick={() => {
                    onSelect(c.id);
                    setOpen(false);
                  }}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {facts.map((f) => (
            <Fact key={f}>{f}</Fact>
          ))}
        </div>
      </div>
    </section>
  );
}

function ScopeOption({
  label,
  sub,
  active,
  onClick,
}: {
  label: string;
  sub: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      role="option"
      aria-selected={active}
      onClick={onClick}
      className="flex min-h-11 w-full items-center justify-between gap-2 px-4 py-[7px] text-left transition-colors hover:bg-surface-2"
    >
      <span className="min-w-0">
        <span
          className={`block truncate text-sm font-semibold ${
            active ? "text-accent-text" : "text-ink"
          }`}
        >
          {label}
        </span>
        <span className="block truncate font-mono text-xs text-ink-3">
          {sub}
        </span>
      </span>
      {active && (
        <Check
          className="h-3.5 w-3.5 flex-none text-accent-text"
          strokeWidth={2.5}
        />
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────

export default function StatistiquesPage() {
  // Périmètre des statistiques : null = tout l'historique, sinon une commande.
  const [commandeId, setCommandeId] = useState<string | null>(null);
  const { data: commandes = [] } = useCommandes();
  const { data, isLoading, isError, error } = useStats(commandeId);
  const selected = commandes.find((c) => c.id === commandeId) ?? null;

  // Le sélecteur reste affiché pendant le chargement et en cas d'erreur :
  // sinon on ne pourrait plus changer de commande depuis un lot en échec.
  const scopeBar = (facts: string[]) => (
    <ScopeBar
      commandes={commandes}
      commandeId={commandeId}
      onSelect={setCommandeId}
      facts={facts}
    />
  );

  if (isLoading && !data) {
    return (
      <Frame>
        {scopeBar([])}
        <Loader label="Chargement des statistiques" />
      </Frame>
    );
  }
  if (isError || !data) {
    return (
      <Frame>
        {scopeBar([])}
        <p className="text-neg">
          {error ? (error as Error).message : "Erreur de chargement."}
        </p>
      </Frame>
    );
  }

  const totalArticles = data.repartitionStatuts.reduce((s, r) => s + r.count, 0);
  const vendus =
    data.repartitionStatuts.find((r) => r.statut === "Vendu")?.count ?? 0;
  const pctEcoule = totalArticles ? vendus / totalArticles : 0;
  const jours = data.projection.joursRestants;
  const caTotal = data.caParCanal.reduce((s, c) => s + c.ca, 0);

  const facts = [
    `${totalArticles.toLocaleString("fr-FR")} ARTICLES`,
    `${vendus.toLocaleString("fr-FR")} VENDUS`,
    ...(selected ? [`${euros(selected.coutTotal)} INVESTIS`] : [`${pct1(pctEcoule)} ÉCOULÉ`]),
  ];

  return (
    <Frame>
      {scopeBar(facts)}

      {/* 2 — ARGENT */}
      <section className="grid grid-cols-1 gap-3.5 min-[900px]:grid-cols-3">
        <CaCard total={caTotal} canaux={data.caParCanal} />

        <div className="rounded-lg border border-line bg-surface p-[22px] shadow-pop">
          <Eyebrow>VITESSE DE VENTE</Eyebrow>
          <div className="mt-2 whitespace-nowrap text-2xl font-bold leading-none tracking-[-0.045em] tabular-nums text-ink">
            {frNum(data.vitesse.parJour7)}
            <span className="text-md font-medium tracking-normal text-ink-2">
              {" "}
              ventes / jour
            </span>
          </div>
          <div className="mt-3.5 flex flex-wrap gap-2">
            <Fact>MOY. 7 J — {frNum(data.vitesse.parJour7)}</Fact>
            <Fact>MOY. 30 J — {frNum(data.vitesse.parJour30)}</Fact>
          </div>
        </div>

        <div className="rounded-lg bg-accent p-[22px] text-accent-ink shadow-pop">
          <div className="font-mono text-xs tracking-[0.2em] opacity-70">
            PROJECTION D’ÉCOULEMENT
          </div>
          <div className="mt-2 whitespace-nowrap text-2xl font-bold leading-none tracking-[-0.045em] tabular-nums">
            {jours != null ? jours.toLocaleString("fr-FR") : "—"}
            <span className="text-md font-medium tracking-normal opacity-75">
              {" "}
              jours
            </span>
          </div>
          <div className="mt-3.5 h-2.5 overflow-hidden rounded-full bg-black/[.16]">
            <div
              className="h-full rounded-full bg-accent-ink"
              style={{ width: `${Math.round(pctEcoule * 100)}%` }}
            />
          </div>
          <div className="mt-[7px] flex justify-between font-mono text-xs opacity-75">
            <span>{vendus.toLocaleString("fr-FR")} ÉCOULÉS</span>
            <span>{pct1(pctEcoule)} DU STOCK</span>
          </div>
          {/* Hors maquette : sans ce rappel, une cadence trop faible pour
              écouler le stock en moins d'un an passerait inaperçue. */}
          {(jours == null || jours > 365) && (
            <div className="mt-2.5 rounded-full bg-black/[.16] px-[13px] py-[7px] text-center font-mono text-xs font-bold">
              {jours == null
                ? "CADENCE NULLE — PROJECTION IMPOSSIBLE"
                : "PLUS D’UN AN AU RYTHME ACTUEL"}
            </div>
          )}
        </div>
      </section>

      {/* 3 — FORME */}
      <section className="grid grid-cols-1 gap-3.5 min-[900px]:grid-cols-[1.1fr_1fr]">
        <WeekdayCard days={data.parJourSemaine} />
        <StatutDonut data={data.repartitionStatuts} />
      </section>

      {/* 4 — MARQUES */}
      <BrandTable rows={data.marquesRentables} caTotal={caTotal} />

      {/* 5 — TOP 5 */}
      <TopArticles rows={data.topArticles} />
    </Frame>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// CA du périmètre — chiffre + répartition par canal
//
// La barre segmentée remplace la carte « CA par canal », qui occupait une
// colonne entière pour une seule ligne (toutes les ventes partent sur Vinted).
// Même idiome que la carte « MARGE NETTE » de la maquette : libellé mono,
// chiffre, barre, légende mono. Le total n'est plus enterré en pied de carte.
// ─────────────────────────────────────────────────────────────────────────

function CaCard({ total, canaux }: { total: number; canaux: CanalCA[] }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-[22px] shadow-pop">
      <Eyebrow>CA DU PÉRIMÈTRE</Eyebrow>
      <div className="mt-2 whitespace-nowrap text-2xl font-bold leading-none tracking-[-0.045em] tabular-nums text-ink">
        {euros(total)}
      </div>
      {canaux.length === 0 ? (
        <div className="mt-3.5 font-mono text-xs text-ink-3">
          {AUCUNE_VENTE}
        </div>
      ) : (
        <>
          <div className="mt-3.5 flex h-2.5 overflow-hidden rounded-full bg-surface-2">
            {canaux.map((c) => (
              <div
                key={c.canal}
                style={{
                  width: `${total ? (c.ca / total) * 100 : 0}%`,
                  background: canalColor(c.canal).bg,
                }}
              />
            ))}
          </div>
          <div className="mt-[9px] flex flex-wrap gap-x-3 gap-y-[5px]">
            {canaux.map((c) => (
              <span
                key={c.canal}
                className="flex items-center gap-1.5 font-mono text-xs text-ink-3"
              >
                <span
                  className="h-[7px] w-[7px] flex-none rounded-full"
                  style={{ background: canalColor(c.canal).bg }}
                />
                <span className="uppercase text-ink-2">{c.canal}</span>
                {pct1(total ? c.ca / total : 0)}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Meilleur jour de la semaine
// ─────────────────────────────────────────────────────────────────────────

// Place prise par ce qui n'est PAS la barre dans une colonne : les deux
// libellés mono (~12px chacun) et leurs deux gouttières de 6px.
const BAR_CHROME = 36;

function WeekdayCard({ days }: { days: WeekdayPoint[] }) {
  const max = Math.max(1, ...days.map((d) => d.vendus));
  const allZero = days.length === 0 || days.every((d) => d.vendus === 0);
  const best = days.reduce<WeekdayPoint | null>(
    (b, d) => (b == null || d.vendus > b.vendus ? d : b),
    null,
  );

  return (
    // `h-full` + `flex-1` sur la zone de barres : la carte prend la hauteur de
    // sa voisine (le donut) et le graphe l'occupe entièrement. Les hauteurs de
    // barres sont donc en %, plus en px — d'où `calc(x% - x·0,36px)`, qui vaut
    // exactement x % de (hauteur disponible − BAR_CHROME) : la plus haute barre
    // touche le plafond sans jamais pousser son libellé hors de la carte.
    <div className="flex h-full flex-col rounded-lg border border-line bg-surface p-[22px]">
      <CardTitle
        aside={!allZero && best ? best.jour.toUpperCase() : undefined}
      >
        Meilleur jour de la semaine
      </CardTitle>
      {allZero ? (
        <div className="flex min-h-40 flex-1 items-center justify-center font-mono text-xs text-ink-3">
          {AUCUNE_VENTE}
        </div>
      ) : (
        <div className="flex min-h-40 flex-1 items-end justify-center gap-[9px]">
          {days.map((d, i) => {
            const pct = (d.vendus / max) * 100;
            return (
              <div
                key={i}
                // `max-w` : sans plafond, sept barres réparties sur une carte
                // large donnent des blocs de 170px qui ne se lisent plus.
                className="flex h-full max-w-[64px] flex-1 flex-col items-center justify-end gap-1.5"
                title={
                  d.dateRecente
                    ? `Dernière vente un ${d.jour.toLowerCase()} : ${dateLongue(d.dateRecente)}`
                    : undefined
                }
              >
                <span className="font-mono text-xs tabular-nums text-ink-2">
                  {d.vendus}
                </span>
                <div
                  className="w-full rounded"
                  style={{
                    height: `calc(${pct.toFixed(2)}% - ${((pct * BAR_CHROME) / 100).toFixed(2)}px)`,
                    minHeight: d.vendus > 0 ? 4 : 0,
                    background:
                      d.vendus === max ? "rgb(var(--accent))" : "rgb(var(--surface-2))",
                    transformOrigin: "bottom",
                    animation: `growBar .55s cubic-bezier(.22,1,.36,1) ${(i * 0.05).toFixed(2)}s both`,
                  }}
                />
                <span className="font-mono text-xs uppercase text-ink-3">
                  {d.jour.slice(0, 3)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Répartition des statuts — donut
// ─────────────────────────────────────────────────────────────────────────

// Longueur de référence du tracé, imposée par `pathLength` sur chaque arc :
// les `stroke-dasharray` / `stroke-dashoffset` se lisent alors directement en
// pourcentage, quelle que soit la géométrie réelle du cercle.
//
// ⚠️ Ne PAS revenir à la circonférence calculée (2π × 15,9 ≈ 99,9). Chrome
// approxime le cercle par des courbes de Bézier et `getTotalLength()` y répond
// 99,2589 : le pointillé se calant sur cette longueur-là, des segments
// totalisant 99,9 débordaient de 0,64 unité (2,3°). Les statuts les plus
// petits démarraient au-delà de la fin du tracé, le motif se répétait, et ils
// se redessinaient par-dessus le premier segment au sommet de la roue.
const DONUT_CIRC = 100;

function StatutDonut({ data }: { data: StatutCount[] }) {
  const total = data.reduce((s, r) => s + r.count, 0);
  let acc = 0;
  const segments = data.map((s) => {
    const frac = total ? s.count / total : 0;
    const len = frac * DONUT_CIRC;
    const seg = {
      statut: s.statut,
      count: s.count,
      color: statutColor(s.statut).color,
      len,
      offset: -acc,
      pct: pct1(frac),
    };
    acc += len;
    return seg;
  });

  return (
    <div className="flex flex-wrap items-center gap-5 rounded-lg border border-line bg-surface p-[22px]">
      <svg
        viewBox="0 0 42 42"
        className="h-[150px] w-[150px] flex-none"
        aria-label="Répartition des statuts"
      >
        <circle
          cx="21"
          cy="21"
          r="15.9"
          fill="none"
          stroke="rgb(var(--surface-2))"
          strokeWidth="6"
        />
        {segments.map((s, i) => (
          <circle
            key={i}
            cx="21"
            cy="21"
            r="15.9"
            fill="none"
            stroke={s.color}
            strokeWidth="6"
            pathLength={DONUT_CIRC}
            strokeDasharray={`${s.len.toFixed(3)} ${(DONUT_CIRC - s.len).toFixed(3)}`}
            strokeDashoffset={s.offset.toFixed(3)}
            transform="rotate(-90 21 21)"
          />
        ))}
      </svg>
      <div className="min-w-40 flex-1">
        <CardTitle aside={`${data.length} STATUTS`}>
          Répartition des statuts
        </CardTitle>
        {segments.map((s, i) => (
          <div
            key={i}
            className="flex items-center gap-[9px] border-b border-line py-1.5"
          >
            <span
              className="h-2 w-2 flex-none rounded-full"
              style={{ background: s.color }}
            />
            <span className="flex-1 truncate text-sm text-ink">
              {s.statut}
            </span>
            <span className="font-mono text-xs tabular-nums text-ink">
              {s.count.toLocaleString("fr-FR")}
            </span>
            <span className="w-[46px] text-right font-mono text-xs tabular-nums text-ink-3">
              {s.pct}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Marques les plus rentables — pleine largeur
//
// Six colonnes, comme la grille « Par marque » de la maquette. La dernière
// (part du CA) encode une information réelle qu'aucune autre colonne ne porte :
// le poids de la marque dans le chiffre d'affaires du périmètre.
// ─────────────────────────────────────────────────────────────────────────

const TH =
  "bg-surface-2 py-[9px] font-mono text-xs font-medium uppercase tracking-[0.14em] text-ink-3";

function BrandTable({
  rows,
  caTotal,
}: {
  rows: StatsBrandRow[];
  caTotal: number;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="px-[22px] pt-[22px]">
        <CardTitle aside={`${rows.length} MARQUES`}>
          Marques les plus rentables
        </CardTitle>
      </div>

      {/* Cartes (< 900px) — CLAUDE.md interdit les tableaux sur mobile. */}
      <div className="px-[22px] pb-3.5 min-[900px]:hidden">
        {rows.length === 0 ? (
          <Empty />
        ) : (
          rows.map((b) => (
            <div
              key={b.marque}
              className="mb-2 rounded-md bg-surface-2 p-3"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-semibold text-ink">
                  {b.marque}
                </span>
                <span className="flex-none font-mono text-xs font-bold text-ink">
                  {coefLabel(b.coefMoyen)}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-sm tabular-nums">
                <span className="text-ink">{euros(b.ca)}</span>
                <span className="text-pos">{euros(b.margeNette)}</span>
                <span className="text-ink-3">{b.vendus} VENDUS</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Tableau (≥ 900px) */}
      <div className="hidden overflow-x-auto min-[900px]:block">
        <table className="w-full min-w-[720px] border-collapse tabular-nums">
          <thead>
            <tr>
              <th className={`${TH} px-[22px] text-left`}>Marque</th>
              <th className={`${TH} px-2.5 text-right`}>Vendus</th>
              <th className={`${TH} px-2.5 text-right`}>CA</th>
              <th className={`${TH} px-2.5 text-right`}>Marge nette</th>
              <th className={`${TH} px-2.5 text-right`}>Coef</th>
              <th className={`${TH} w-[180px] px-[22px] text-right`}>
                Part du CA
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => {
              const part = caTotal ? b.ca / caTotal : 0;
              return (
                <tr
                  key={b.marque}
                  className="border-b border-line transition-colors hover:bg-surface-2"
                >
                  <td className="px-[22px] py-[11px] text-sm font-semibold text-ink">
                    {b.marque}
                  </td>
                  <td className="px-2.5 py-[11px] text-right font-mono text-xs text-ink-3">
                    {b.vendus}
                  </td>
                  <td className="px-2.5 py-[11px] text-right font-mono text-sm text-ink">
                    {euros(b.ca)}
                  </td>
                  <td className="px-2.5 py-[11px] text-right font-mono text-sm text-pos">
                    {euros(b.margeNette)}
                  </td>
                  <td className="px-2.5 py-[11px] text-right font-mono text-sm font-bold text-ink">
                    {coefLabel(b.coefMoyen)}
                  </td>
                  <td className="px-[22px] py-[11px]">
                    <span className="flex items-center gap-[9px]">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                        <span
                          className="block h-full rounded-full bg-ink-2"
                          style={{ width: `${Math.round(part * 100)}%` }}
                        />
                      </span>
                      <span className="w-[46px] flex-none text-right font-mono text-xs tabular-nums text-ink-3">
                        {pct1(part)}
                      </span>
                    </span>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <Empty />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Top 5 articles — cinq cartes
//
// Cinq lignes dans un tableau pleine largeur laissaient quatre colonnes
// perdues dans le vide. En cartes, chaque vente occupe sa colonne et le rang
// devient lisible d'un coup d'œil. Le numéro est ici une vraie information :
// c'est un classement, l'ordre porte du sens.
// ─────────────────────────────────────────────────────────────────────────

function TopArticles({ rows }: { rows: TopArticle[] }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-[22px]">
      <CardTitle aside="PAR PRIX DE VENTE">Meilleures ventes</CardTitle>
      {rows.length === 0 ? (
        <Empty />
      ) : (
        <div className="grid grid-cols-2 gap-2.5 min-[900px]:grid-cols-5">
          {rows.map((a, i) => (
            <div
              key={a.sku}
              className="rounded-lg bg-surface-2 p-3.5 transition-colors hover:bg-surface-3"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-xs tracking-[0.16em] text-ink-3">
                  N°{i + 1}
                </span>
                <span className="truncate font-mono text-xs font-bold text-ink">
                  {a.sku}
                </span>
              </div>
              <div className="mt-2.5 truncate text-sm text-ink-2">
                {a.marque}
              </div>
              <div className="mt-1.5 text-lg font-bold tracking-[-0.03em] tabular-nums text-ink">
                {euros(a.prixVente)}
              </div>
              <div className="mt-0.5 font-mono text-xs tabular-nums text-pos">
                {euros(a.margeNette)} de marge
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
