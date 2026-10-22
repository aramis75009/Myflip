"use client";
// design-tokens-dette: R10 R12 → M5

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  HandCoins,
  Package,
  Tag,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { fr } from "date-fns/locale";
import {
  useDashboard,
  useObjectifMensuel,
  type DashboardPeriode,
} from "@/lib/hooks";
import { coefLabel, euros, pct1, pctInt } from "@/lib/calc";
import { useIdentite } from "@/lib/useIdentite";
import type { BrandRow, DashboardDelta } from "@/lib/types";
import { CardTitle, Eyebrow, Frame } from "@/components/console";
import Loader from "@/components/Loader";
import DemarrageCard from "@/components/DemarrageCard";

// ─────────────────────────────────────────────────────────────────────────
// Dashboard — structure « Direction C — Console tactile », au pixel.
//
// Toutes les tailles (rayons, paddings, corps de texte, hauteurs de barres)
// sont relevées sur la maquette et posées en valeurs arbitraires plutôt qu'en
// échelle Tailwind : la maquette raisonne en demi-pixels (10,5px / 12,5px /
// 9,5px) que l'échelle par défaut ne sait pas exprimer.
//
// La maquette bascule ses grilles à 900px — ni `md:` (768) ni `lg:` (1024).
// D'où `min-[900px]:`, qui reste mobile-first et évite d'ajouter un
// breakpoint maison à tailwind.config.ts pour un seul écran.
//
// Deux écarts assumés vis-à-vis de la maquette, tous deux imposés par les
// règles mobile du projet :
//   · les boutons de période font 44px sur mobile (Apple HIG) et 36px en
//     desktop — c'est déjà la convention retenue pour les chips du Stock ;
//   · la ligne « Par marque » se replie en deux niveaux sous 900px, la
//     grille 6 colonnes de la maquette ne tenant pas dans 390px.
// ─────────────────────────────────────────────────────────────────────────

// Segmented control de la maquette : quatre codes mono, plus de menu déroulant.
const PERIODES: { key: DashboardPeriode; code: string }[] = [
  { key: "month", code: "MOIS" },
  { key: "30j", code: "30J" },
  { key: "3m", code: "TRIM." },
  { key: "all", code: "TOUT" },
];

// ─────────────────────────────────────────────────────────────────────────
// Helpers d'affichage
// ─────────────────────────────────────────────────────────────────────────

// Date du jour en capitales mono (« MERCREDI 29 JUILLET 2026 »).
function todayLabel(): string {
  return new Date()
    .toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    })
    .toUpperCase();
}

// Libellé de la période tel qu'il apparaît dans le héros (« CA TOTAL — X »).
function periodeTitre(p: DashboardPeriode): string {
  switch (p) {
    case "month":
      return format(new Date(), "MMMM", { locale: fr }).toUpperCase();
    case "30j":
      return "30 JOURS";
    case "3m":
      return "3 MOIS";
    case "all":
      return "TOUT L’HISTORIQUE";
  }
}

// Pourcentage signé : 0.154 → « +12,4 % », -0.062 → « −6,2 % ». null si pas de base.
function signedPct(p: number | null): string | null {
  if (p == null || !Number.isFinite(p)) return null;
  return `${p >= 0 ? "+" : "−"}${pct1(Math.abs(p))}`;
}

// Euros signés : 1689 → « +1 689,00 € », -420 → « −420,00 € ».
function signedEur(n: number): string {
  return `${n >= 0 ? "+" : "−"}${euros(Math.abs(n))}`;
}

// Initiales d'une marque pour le jeton carré (Ralph Lauren → « RL »).
function initials(marque: string): string {
  const words = marque.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return marque.trim().slice(0, 2).toUpperCase();
}

// Le Dashboard affiche les coefficients à la décimale (« 2,9× »), les
// Statistiques au centième : d'où le paramètre plutôt que deux helpers.
const coefDash = (n: number) => coefLabel(n, 1);

// ─────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  // Prénom du compte connecté (plus de constante de build : cf. lib/useIdentite).
  const { nom } = useIdentite();
  // Le Dashboard atterrit sur le mois en cours (#15).
  const [periode, setPeriode] = useState<DashboardPeriode>("month");
  const { data, isLoading, isError, error } = useDashboard(periode);
  // CA du mois en cours pour l'anneau d'objectif — indépendant de la période
  // sélectionnée. Même clé que « month » → dédupliqué par react-query.
  const { data: moisData } = useDashboard("month");
  // Objectif mensuel, porté par le compte (réglé dans Paramètres).
  const { objectif } = useObjectifMensuel();

  if (isLoading && !data) {
    return (
      <Frame>
        <Loader label="Chargement du dashboard" />
      </Frame>
    );
  }
  if (isError || !data) {
    return (
      <Frame>
        <p className="text-neg">
          {error ? (error as Error).message : "Erreur de chargement."}
        </p>
      </Frame>
    );
  }

  const isMonth = periode === "month";
  const titre = periodeTitre(periode);
  // Barres du graphe : semaines calendaires du mois en vue « Ce mois »,
  // 8 dernières semaines sinon.
  const bars: Bar[] = isMonth
    ? semainesDuMois(data.caParJour)
    : data.caParSemaine.map((w) => ({ label: w.semaine, ca: w.ca }));

  return (
    <Frame>
      {/* Reste visible tant que la configuration Trello n'est pas terminée,
          puis s'efface. Remplace la modale de bienvenue, qui s'affichait une
          fois et ne revenait jamais, même sans rien configurer. */}
      <DemarrageCard />

      {/* SALUTATION + PÉRIODE */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xl font-bold tracking-[-0.03em] text-ink">
            Bonjour {nom}
          </div>
          <div className="mt-[3px] font-mono text-xs tracking-[0.06em] text-ink-3">
            {todayLabel()}
          </div>
        </div>
        <div className="flex gap-1.5 rounded-full border border-line bg-surface p-1">
          {PERIODES.map((p) => {
            const on = p.key === periode;
            return (
              <button
                key={p.key}
                onClick={() => setPeriode(p.key)}
                className={`min-h-11 rounded-full px-[15px] font-mono text-xs tracking-[0.08em] transition-colors md:min-h-9 ${
                  on
                    ? "bg-accent text-accent-ink"
                    : "text-ink-2 hover:bg-surface-2"
                }`}
              >
                {p.code}
              </button>
            );
          })}
        </div>
      </div>

      {/* HÉROS + MARGE + OBJECTIF */}
      <section className="grid grid-cols-1 gap-3.5 min-[900px]:grid-cols-[1.5fr_1fr]">
        <HeroCA
          ca={data.caTotal}
          delta={data.caDelta}
          moisPrecedent={data.caMoisPrecedent}
          spark={data.caParSemaine.map((w) => w.ca)}
          titre={titre}
        />
        <div className="flex flex-col gap-3.5">
          <MargeCard
            total={data.margeNetteTotal}
            ca={data.caTotal}
            moyenne={data.margeMoyenne}
          />
          <ObjectifCard caMois={moisData?.caTotal ?? null} objectif={objectif} />
        </div>
      </section>

      {/* KPI */}
      <section className="grid grid-cols-2 gap-3.5 min-[900px]:grid-cols-4">
        <Kpi
          icon={TrendingUp}
          label="ARTICLES VENDUS"
          value={String(data.vendus)}
          delta={`${pctInt(data.pctVendu)} DU CATALOGUE`}
        />
        <Kpi
          icon={HandCoins}
          label="PANIER MOYEN"
          value={euros(data.vendus ? data.caTotal / data.vendus : 0)}
          delta={`MARGE ${pctInt(data.margeMoyenne)}`}
          positive
        />
        <Kpi
          icon={Tag}
          label="EN VENTE"
          value={String(data.enVente)}
          delta={`${pct1(
            data.totalArticles ? data.enVente / data.totalArticles : 0,
          )} DU STOCK`}
        />
        <Kpi
          icon={Package}
          label="NOUVEAUX AU STOCK"
          value={String(data.nouveaux)}
          delta={titre}
        />
      </section>

      {/* GRAPHE + MARQUES */}
      <section className="grid grid-cols-1 gap-3.5 min-[900px]:grid-cols-[1fr_1.25fr]">
        <WeekBars
          key={periode}
          bars={bars}
          aside={
            isMonth
              ? format(new Date(), "MMMM yyyy", { locale: fr }).toUpperCase()
              : "8 DERNIÈRES"
          }
        />
        <BrandList
          brands={isMonth ? data.parMarque.filter((b) => b.vendus > 0) : data.parMarque}
        />
      </section>
    </Frame>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Héros — CA de la période
// ─────────────────────────────────────────────────────────────────────────

// Carte pleine d'accent : lime sur fond sombre, vert forêt en clair. Tout le
// contenu hérite de --acc-ink, y compris la courbe (`currentColor`).
function HeroCA({
  ca,
  delta,
  moisPrecedent,
  spark,
  titre,
}: {
  ca: number;
  delta: DashboardDelta;
  moisPrecedent: number;
  spark: number[];
  titre: string;
}) {
  const pct = signedPct(delta.pct);
  const positive = delta.pct == null || delta.pct >= 0;
  const moisPrec = format(subMonths(new Date(), 1), "MMMM", { locale: fr });

  return (
    <div className="relative overflow-hidden rounded-lg bg-accent p-[26px] text-accent-ink shadow-pop">
      <div className="flex items-start justify-between gap-3">
        <span className="font-mono text-xs tracking-[0.2em] opacity-70">
          CA TOTAL — {titre}
        </span>
        {pct && (
          <span className="flex-none rounded-full bg-black/[.14] px-2.5 py-1 font-mono text-xs font-bold tabular-nums">
            {positive ? "▲" : "▼"} {pct}
          </span>
        )}
      </div>
      <div className="mt-3.5 whitespace-nowrap text-2xl font-bold leading-none tracking-[-0.045em] tabular-nums min-[900px]:text-3xl">
        {euros(ca)}
      </div>
      <div className="mt-0.5 font-mono text-xs opacity-75">
        vs {euros(moisPrecedent)} en {moisPrec} · écart {signedEur(delta.abs)}
      </div>
      <Sparkline values={spark} />
    </div>
  );
}

// Courbe pleine largeur en bas du héros. `preserveAspectRatio="none"` étire
// horizontalement ; `vector-effect` maintient le trait à 2px malgré l'étirement.
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 400;
      const y = 62 - ((v - min) / span) * 54;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      viewBox="0 0 400 70"
      preserveAspectRatio="none"
      aria-hidden="true"
      className="mt-4 block h-[76px] w-full"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        opacity=".85"
      />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Marge nette
// ─────────────────────────────────────────────────────────────────────────

function MargeCard({
  total,
  ca,
  moyenne,
}: {
  total: number;
  ca: number;
  moyenne: number;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface p-[22px] shadow-pop">
      <Eyebrow>MARGE NETTE</Eyebrow>
      <div className="mt-2 flex items-baseline gap-2.5">
        <span className="text-2xl font-bold tracking-[-0.035em] tabular-nums text-ink">
          {euros(total)}
        </span>
        <span className="font-mono text-xs text-pos">
          {pct1(moyenne)}
        </span>
      </div>
      <div className="mt-3.5 h-2.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-pos"
          style={{ width: `${Math.min(100, Math.max(0, moyenne * 100))}%` }}
        />
      </div>
      <div className="mt-[7px] flex justify-between font-mono text-xs text-ink-3">
        <span>CA {euros(ca)}</span>
        <span>NET {euros(total)}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Objectif mensuel — anneau (#15)
// ─────────────────────────────────────────────────────────────────────────

// Longueur de référence de l'anneau, imposée par `pathLength` : le pointillé
// se lit alors directement en pourcentage.
//
// ⚠️ Ne PAS revenir à la circonférence calculée (2π × 41 ≈ 257,6, la valeur
// que la maquette pose en dur). Chrome approxime le cercle par des courbes de
// Bézier et sa longueur de tracé est ~0,65 % plus courte : l'arc se dessinait
// trop long, un objectif à 50 % s'affichant à 50,3 %.
const RING_CIRC = 100;

function ObjectifCard({
  caMois,
  objectif,
}: {
  caMois: number | null;
  objectif: number | null;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Pas encore d'objectif : même carte, bordure pointillée, lien vers Paramètres.
  if (objectif == null) {
    return (
      <Link
        href="/parametres"
        className="rounded-lg border border-dashed border-line-strong bg-surface p-[22px] transition-colors hover:border-accent"
      >
        <Eyebrow>OBJECTIF</Eyebrow>
        <div className="mt-1 text-xl font-bold tracking-[-0.03em] text-ink">
          À définir
        </div>
        <div className="font-mono text-xs leading-[1.6] text-ink-2">
          règle ta cible mensuelle
          <br />
          dans Paramètres →
        </div>
      </Link>
    );
  }

  const ca = caMois ?? 0;
  const pct = objectif > 0 ? Math.min(1, ca / objectif) : 0;
  const atteint = ca >= objectif;

  return (
    <div className="flex items-center gap-[18px] rounded-lg border border-line bg-surface p-[22px] shadow-pop">
      <svg
        viewBox="0 0 100 100"
        className="h-[88px] w-[88px] flex-none"
        aria-label={`Objectif mensuel atteint à ${pct1(pct)}`}
      >
        <circle
          cx="50"
          cy="50"
          r="41"
          fill="none"
          stroke="rgb(var(--surface-2))"
          strokeWidth="12"
        />
        <circle
          cx="50"
          cy="50"
          r="41"
          fill="none"
          stroke="rgb(var(--accent))"
          strokeWidth="12"
          strokeLinecap="round"
          pathLength={RING_CIRC}
          strokeDasharray={RING_CIRC}
          transform="rotate(-90 50 50)"
          style={{
            strokeDashoffset: RING_CIRC * (1 - (mounted ? pct : 0)),
            transition: "stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1)",
          }}
        />
      </svg>
      <div className="min-w-0">
        <Eyebrow>OBJECTIF</Eyebrow>
        <div className="mt-1 whitespace-nowrap text-xl font-bold tracking-[-0.03em] text-ink">
          {pct1(pct)}
        </div>
        <div className="font-mono text-xs leading-[1.6] text-ink-2">
          cible {euros(objectif)}
          <br />
          {atteint
            ? `dépassé de ${euros(ca - objectif)}`
            : `reste ${euros(objectif - ca)}`}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// KPI
// ─────────────────────────────────────────────────────────────────────────

function Kpi({
  icon: Icon,
  label,
  value,
  delta,
  positive,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  delta: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface p-[18px] transition-colors hover:border-line-strong">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-xs tracking-[0.16em] text-ink-3">
          {label}
        </span>
        <Icon
          className="h-3.5 w-3.5 flex-none text-ink-3"
          strokeWidth={2}
        />
      </div>
      <div className="mt-2.5 truncate text-xl font-bold tracking-[-0.03em] tabular-nums text-ink">
        {value}
      </div>
      <div
        className={`mt-[3px] truncate font-mono text-xs ${
          positive ? "text-pos" : "text-ink-3"
        }`}
      >
        {delta}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Graphe : CA par semaine
// ─────────────────────────────────────────────────────────────────────────

type Bar = { label: string; ca: number };

// Semaines lundi → dimanche calées sur la grille du Calendrier : chaque barre
// vaut exactement la ligne « CA SEMAINE » correspondante. Découper en tranches
// de 7 jours depuis le 1er donnait des semaines fictives (1–7, 8–14…) qui ne
// tombaient jamais sur les mêmes ventes que le calendrier.
function semainesDuMois(data: { jour: string; ca: number }[]): Bar[] {
  const moisRef = new Date();
  // Mêmes bornes que `weeks` dans app/calendrier/page.tsx.
  const gridStart = startOfWeek(startOfMonth(moisRef), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(moisRef), { weekStartsOn: 1 });
  const nbSemaines = Math.round(
    (differenceInCalendarDays(gridEnd, gridStart) + 1) / 7,
  );
  const weeks: Bar[] = Array.from({ length: nbSemaines }, (_, i) => {
    const debut = addDays(gridStart, i * 7);
    const fin = addDays(debut, 6);
    return { label: `${debut.getDate()}–${fin.getDate()}`, ca: 0 };
  });

  // `data` ne contient que les jours du mois courant : les jours des mois
  // voisins présents dans la grille restent donc à 0, comme au Calendrier.
  for (const { jour, ca } of data) {
    const date = new Date(moisRef.getFullYear(), moisRef.getMonth(), Number(jour));
    const idx = Math.floor(differenceInCalendarDays(date, gridStart) / 7);
    if (weeks[idx]) weeks[idx].ca += ca;
  }
  return weeks;
}

// Hauteur de la plus haute barre. La zone fait 170px : les 42px restants sont
// pris par les deux libellés mono et leurs gouttières de 7px.
const BAR_MAX_H = 128;

function WeekBars({ bars, aside }: { bars: Bar[]; aside: string }) {
  const max = Math.max(1, ...bars.map((b) => b.ca));
  return (
    <div className="rounded-lg border border-line bg-surface p-[22px]">
      <CardTitle className="mb-[18px]" aside={aside}>
        CA par semaine
      </CardTitle>
      <div className="flex h-[170px] items-end gap-[9px]">
        {bars.map((b, i) => (
          <div
            key={i}
            className="flex h-full flex-1 flex-col items-center justify-end gap-[7px]"
          >
            <span className="font-mono text-xs tabular-nums text-ink-2">
              {Math.round(b.ca)}
            </span>
            <div
              className="w-full rounded"
              style={{
                height: Math.round((b.ca / max) * BAR_MAX_H),
                background:
                  b.ca === max ? "rgb(var(--accent))" : "rgb(var(--surface-2))",
                transformOrigin: "bottom",
                animation: `growBar .55s cubic-bezier(.22,1,.36,1) ${(i * 0.05).toFixed(2)}s both`,
              }}
            />
            <span className="truncate font-mono text-xs text-ink-3">
              {b.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Par marque
// ─────────────────────────────────────────────────────────────────────────

function BrandList({ brands }: { brands: BrandRow[] }) {
  const router = useRouter();
  return (
    <div className="rounded-lg border border-line bg-surface p-[22px]">
      <CardTitle className="mb-3" aside={`${brands.length} ACTIVES`}>
        Par marque
      </CardTitle>

      {brands.length === 0 ? (
        <div className="rounded-md bg-surface-2 px-2.5 py-7 text-center font-mono text-xs text-ink-3">
          AUCUNE VENTE SUR LA PÉRIODE
        </div>
      ) : (
        brands.map((b) => (
          <button
            key={b.marque}
            onClick={() =>
              router.push(`/stock?marque=${encodeURIComponent(b.marque)}`)
            }
            // Sous 900px la grille 6 colonnes de la maquette ne rentre pas :
            // CA et marge passent sur une seconde ligne, le taux disparaît.
            className="mb-2 grid w-full grid-cols-[36px_1fr_auto] items-center gap-x-2.5 gap-y-1.5 rounded-md bg-surface-2 p-2.5 text-left transition-colors hover:bg-surface-3 min-[900px]:grid-cols-[38px_1fr_58px_82px_82px_92px] min-[900px]:gap-x-3 min-[900px]:gap-y-0"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-surface-3 font-mono text-xs font-bold text-ink">
              {initials(b.marque)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-base font-semibold text-ink">
                {b.marque}
              </span>
              <span className="block truncate font-mono text-xs text-ink-3">
                {b.enStock} en stock · {b.vendus} vendus
              </span>
            </span>
            <span className="justify-self-end rounded-full bg-accent px-2 py-[3px] text-center font-mono text-xs font-bold text-accent-ink min-[900px]:w-full min-[900px]:justify-self-auto min-[900px]:px-0">
              {coefDash(b.coefMoyen)}
            </span>
            <span className="col-start-2 font-mono text-sm tabular-nums text-ink min-[900px]:col-start-auto min-[900px]:text-right">
              {euros(b.ca)}
            </span>
            <span className="text-right font-mono text-sm tabular-nums text-pos">
              +{euros(b.margeNette)}
            </span>
            <span className="hidden min-[900px]:block">
              <span className="block h-1.5 overflow-hidden rounded-full bg-surface-3">
                <span
                  className="block h-full bg-ink"
                  style={{ width: `${Math.round(b.pctVendu * 100)}%` }}
                />
              </span>
              <span className="mt-[3px] block text-right font-mono text-xs text-ink-3">
                {pctInt(b.pctVendu)}
              </span>
            </span>
          </button>
        ))
      )}
    </div>
  );
}
