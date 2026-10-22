"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { RefreshCw, Search, SearchX, Star, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState } from "@/components/ui/states";
import { cn } from "@/lib/cn";
import { pluriel } from "@/lib/format";
import { RATIO_STUDIO, formatEur, formatUsd } from "@/lib/studioModeles";

import {
  FILTRES_VIDES,
  MAX_MODELES_LANCEMENT,
  basculerSelection,
  construireLignes,
  coutMoyenReel,
  depassement,
  depuis,
  filtrerLignes,
  libelleReussite,
  partDuBudget,
  sectionsLignes,
  trierLignes,
  type FiltresModeles,
  type LigneModele,
  type TriModeles,
} from "../_modeles";
import type { ContexteModeles } from "./useModeles";

const heure = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).replace(" ", " à ");

/**
 * The model picker of the « Génération » step: search, favourites pinned and
 * toggleable, « dans le budget » and « déjà testé » filters, sort by bag cost
 * or by success, and 1 to 3 models (2 or 3 = a side-by-side comparison).
 *
 * Every row says what the model costs for a FULL bag against the account
 * budget (expensive models shown as they are, with their overrun), and what
 * it really did for Aramis (first-try success, real average cost, images,
 * last use); « jamais essayé » when it never ran, never 0 %.
 */
export default function SelecteurModeles({
  contexte,
  selection,
  onSelection,
}: {
  contexte: ContexteModeles;
  selection: string[];
  onSelection: (ids: string[]) => void;
}) {
  const { catalogue, agregats, budget, chargement, erreur, recharger, favoris, favorisEnCours, basculerFavori } = contexte;
  const [filtres, setFiltres] = useState<FiltresModeles>(FILTRES_VIDES);
  const [tri, setTri] = useState<TriModeles>("cout");
  const [plein, setPlein] = useState(false);
  const maintenant = useMemo(() => new Date(), []);

  const lignes = useMemo(
    () => construireLignes(catalogue?.modeles ?? [], agregats, favoris, budget),
    [catalogue, agregats, favoris, budget],
  );
  const parId = useMemo(() => new Map(lignes.map((l) => [l.modele.id, l])), [lignes]);
  const visibles = trierLignes(filtrerLignes(lignes, filtres), tri);
  const sections = sectionsLignes(visibles);
  const choisies = selection.map((id) => parId.get(id)).filter((l): l is LigneModele => !!l);
  const favorisAbsents = favoris.filter((id) => !parId.has(id));
  const filtre = filtres.q.trim() !== "" || filtres.dansBudget || filtres.dejaTeste;

  function basculer(id: string) {
    const r = basculerSelection(selection, id);
    setPlein(r.refus === "plein");
    if (!r.refus) onSelection(r.selection);
  }

  if (!catalogue && chargement) {
    return (
      <p role="status" className="rounded-md bg-surface-2 px-4 py-6 text-center text-sm text-ink-2">
        Chargement du catalogue…
      </p>
    );
  }
  if (!catalogue || catalogue.modeles.length === 0) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 rounded-md border border-warn bg-warn-soft px-4 py-3 text-sm text-ink">
        <span>
          {erreur ? `Catalogue indisponible (${erreur}).` : "Catalogue OpenRouter injoignable : aucun modèle à proposer pour l’instant."} Génère
          « À la main, dans Gemini » ou réessaie.
        </span>
        <Button variant="secondary" size="sm" pending={chargement} pendingLabel="Lecture…" onClick={() => recharger(true)}>
          <RefreshCw size={14} aria-hidden /> Réessayer
        </Button>
      </div>
    );
  }

  const rang = (id: string) => {
    const i = selection.indexOf(id);
    return i === -1 ? null : i + 1;
  };
  const ligne = (l: LigneModele) => (
    <LigneModeleVue
      key={l.modele.id}
      l={l}
      rang={rang(l.modele.id)}
      budgetEur={budget.budgetParSacEur}
      taux={budget.tauxEurParUsd}
      maintenant={maintenant}
      favoriEnCours={favorisEnCours.includes(l.modele.id)}
      onBasculer={() => basculer(l.modele.id)}
      onEtoile={() => basculerFavori(l.modele.id)}
    />
  );

  return (
    <div className="flex flex-col gap-3">
      {/* État du catalogue : en direct, ou dernier relevé connu */}
      {catalogue.etat.kind === "stale" ? (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-md border border-warn bg-warn-soft px-3 py-2 text-sm text-ink">
          <span className="min-w-0 flex-1">
            OpenRouter ne répond pas : liste et tarifs du dernier relevé
            {catalogue.fetchedAt ? `, le ${heure(catalogue.fetchedAt)}` : ""}
            {catalogue.source === "navigateur" ? ", gardé par ce navigateur" : ""}. Le serveur revérifie chaque prix avant de payer.
          </span>
          <Button variant="secondary" size="sm" pending={chargement} pendingLabel="Lecture…" onClick={() => recharger(true)}>
            <RefreshCw size={14} aria-hidden /> Rafraîchir
          </Button>
        </div>
      ) : null}

      {/* Recherche, filtres, tri */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <Input
            type="search"
            value={filtres.q}
            onChange={(e) => setFiltres((f) => ({ ...f, q: e.target.value }))}
            placeholder="Rechercher : qwen, seedream, gemini…"
            aria-label="Rechercher un modèle"
            className="pl-9"
          />
        </div>
        <Bascule actif={filtres.dansBudget} onClick={() => setFiltres((f) => ({ ...f, dansBudget: !f.dansBudget }))}>
          Dans le budget
        </Bascule>
        <Bascule actif={filtres.dejaTeste} onClick={() => setFiltres((f) => ({ ...f, dejaTeste: !f.dejaTeste }))}>
          Déjà testé
        </Bascule>
        <Segmented<TriModeles>
          label="Trier les modèles"
          value={tri}
          onValueChange={setTri}
          options={[
            { valeur: "cout", libelle: "Coût du sac" },
            { valeur: "reussite", libelle: "Réussite" },
          ]}
        />
        {catalogue.etat.kind !== "stale" && (
          <IconButton label="Rafraîchir le catalogue" variant="ghost" pending={chargement} onClick={() => recharger(true)}>
            <RefreshCw size={16} aria-hidden />
          </IconButton>
        )}
      </div>

      {/* Sélection : 1 modèle, ou 2 à 3 pour comparer */}
      <div aria-live="polite" className="flex min-h-9 flex-wrap items-center gap-2 text-sm">
        {choisies.length === 0 ? (
          <span className="text-ink-2">Choisis un modèle, ou 2 à {MAX_MODELES_LANCEMENT} pour les comparer sur les mêmes prises.</span>
        ) : (
          <>
            <span className="font-semibold text-ink">{choisies.length === 1 ? "Modèle choisi" : `${choisies.length} modèles comparés`}</span>
            {choisies.map((l, i) => (
              <span key={l.modele.id} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-accent-soft pl-1 pr-1 text-sm font-semibold text-ink">
                <Rond>{i + 1}</Rond>
                <span className="max-w-48 truncate">{l.modele.nom}</span>
                <button
                  type="button"
                  aria-label={`Retirer ${l.modele.nom} de la sélection`}
                  onClick={() => basculer(l.modele.id)}
                  className="grid h-6 w-6 place-items-center rounded-full text-ink-2 hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  <X size={14} aria-hidden />
                </button>
              </span>
            ))}
            {plein && <span className="text-ink">{MAX_MODELES_LANCEMENT} modèles au plus : retires-en un d’abord.</span>}
          </>
        )}
      </div>

      {/* Les modèles */}
      <div className="max-h-[34rem] overflow-y-auto overscroll-contain rounded-md border border-line">
        {sections.favoris.length > 0 && (
          <Groupe titre="Favoris" n={sections.favoris.length}>
            {sections.favoris.map(ligne)}
          </Groupe>
        )}
        {favorisAbsents.length > 0 && !filtre && (
          <ul aria-label="Favoris absents du catalogue" className="border-b border-line">
            {favorisAbsents.map((id) => (
              <li key={id} className="flex items-center gap-2 px-1.5 py-1 text-sm text-ink-2">
                <IconButton
                  label={`Retirer ${id} des favoris`}
                  aria-pressed
                  disabled={favorisEnCours.includes(id)}
                  onClick={() => basculerFavori(id)}
                >
                  <Star size={16} aria-hidden className="fill-current text-warn" />
                </IconButton>
                <span className="min-w-0 truncate font-mono text-xs">{id}</span>
                <span className="flex-none">absent du catalogue OpenRouter</span>
              </li>
            ))}
          </ul>
        )}
        {sections.autres.length > 0 && (
          <Groupe titre={sections.favoris.length > 0 ? "Autres modèles" : "Tous les modèles"} n={sections.autres.length}>
            {sections.autres.map(ligne)}
          </Groupe>
        )}
        {visibles.length === 0 && (
          <EmptyState
            icone={<SearchX />}
            titre="Aucun modèle ne correspond"
            description={
              filtres.dansBudget
                ? `Aucun modèle ne tient un sac complet dans ${formatEur(budget.budgetParSacEur)}. Retire le filtre, ou relève le budget.`
                : "Change la recherche ou retire un filtre."
            }
            action={
              <Button variant="secondary" size="sm" onClick={() => setFiltres(FILTRES_VIDES)}>
                Effacer la recherche et les filtres
              </Button>
            }
          />
        )}
      </div>
      <p className="text-xs text-ink-3">
        Coût du sac = {pluriel(15, "prise", "prises")} × le prix par image, au taux de {String(budget.tauxEurParUsd).replace(".", ",")} € pour 1 $ ; réussite
        = images validées du premier coup, d’après tes décisions seulement.
      </p>
    </div>
  );
}

function Bascule({ actif, onClick, children }: { actif: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Button
      variant="secondary"
      size="sm"
      aria-pressed={actif}
      onClick={onClick}
      className={cn("md:h-9", actif && "border-accent bg-accent-soft text-ink hover:bg-accent-soft")}
    >
      {children}
    </Button>
  );
}

function Groupe({ titre, n, children }: { titre: string; n: number; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id}>
      <h3 id={id} className="sticky top-0 z-raised flex items-baseline gap-2 border-b border-line bg-surface-2 px-3 py-1.5 text-xs font-semibold text-ink-2">
        {titre} <span className="font-mono font-medium text-ink-3">{n}</span>
      </h3>
      <ul>{children}</ul>
    </section>
  );
}

function Rond({ children, vide = false }: { children?: ReactNode; vide?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid h-6 w-6 flex-none place-items-center rounded-full text-xs font-bold",
        vide ? "border border-line-strong" : "bg-accent text-accent-ink",
      )}
    >
      {children}
    </span>
  );
}

/** Bag cost against the budget: the bar fills up to the budget, an overrun is said in words. */
function Jauge({ part, hors }: { part: number | null; hors: boolean }) {
  if (part === null) return <span aria-hidden className="h-1.5 w-24 rounded-full border border-dashed border-line-strong" />;
  return (
    <span aria-hidden className="relative h-1.5 w-24 overflow-hidden rounded-full bg-surface-3">
      <span className={cn("absolute inset-y-0 left-0 rounded-full", hors ? "bg-warn" : "bg-chart")} style={{ width: `${Math.min(part, 1) * 100}%` }} />
    </span>
  );
}

function LigneModeleVue({
  l,
  rang,
  budgetEur,
  taux,
  maintenant,
  favoriEnCours,
  onBasculer,
  onEtoile,
}: {
  l: LigneModele;
  rang: number | null;
  budgetEur: number;
  taux: number;
  maintenant: Date;
  favoriEnCours: boolean;
  onBasculer: () => void;
  onEtoile: () => void;
}) {
  const idDetails = useId();
  const { modele: m, sac, agregat } = l;
  const choisi = rang !== null;
  const reussite = libelleReussite(agregat);
  const reel = coutMoyenReel(agregat, taux);
  const derniere = depuis(agregat?.derniereUtilisation ?? null, maintenant);
  const hors = sac.statutBudget === "hors";
  const trop = depassement(sac.eur, budgetEur);
  const sansRatio = !m.ratios?.includes(RATIO_STUDIO);

  return (
    <li className={cn("flex items-stretch gap-1 border-b border-line px-1.5 py-1 last:border-b-0", choisi && "bg-accent-soft")}>
      <IconButton
        label={l.favori ? `Retirer ${m.nom} des favoris` : `Épingler ${m.nom} en favori`}
        aria-pressed={l.favori}
        disabled={favoriEnCours}
        onClick={onEtoile}
        className="self-center"
      >
        <Star size={16} aria-hidden className={l.favori ? "fill-current text-warn" : "text-ink-3"} />
      </IconButton>
      <button
        type="button"
        aria-pressed={choisi}
        aria-label={m.nom}
        aria-describedby={idDetails}
        disabled={!!l.inutilisable}
        onClick={onBasculer}
        title={m.id}
        className={cn(
          "grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 rounded-sm px-2 py-2 text-left transition-colors duration-fast",
          "hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-60",
          choisi && "hover:bg-accent-soft",
        )}
      >
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Rond vide={!choisi}>{rang}</Rond>
          <span className="min-w-0 truncate text-base font-semibold text-ink">{m.nom}</span>
          {hors && <Badge ton="warn">Hors budget</Badge>}
          {sac.statutBudget === "inconnu" && <Badge>{sac.raison === "jeton" ? "Tarif au jeton" : "Prix non publié"}</Badge>}
          {sansRatio && !l.inutilisable && <Badge>Pas de 3:4</Badge>}
          {l.inutilisable && <Badge ton="neg">Inutilisable ici</Badge>}
        </span>

        <span className="row-span-2 flex flex-col items-end gap-1 text-right">
          <span className="font-mono text-md font-semibold tabular-nums text-ink">{sac.eur !== null ? formatEur(sac.eur) : "prix inconnu"}</span>
          <Jauge part={partDuBudget(sac.eur, budgetEur)} hors={hors} />
          <span className="text-xs text-ink-2">{sac.eur === null ? "confirmation à chaque lancement" : trop ?? "le sac de 15 prises"}</span>
        </span>

        <span id={idDetails} className="col-start-1 flex min-w-0 flex-wrap gap-x-3 gap-y-0.5 pl-8 text-xs text-ink-2">
          {l.inutilisable ? (
            <span>{l.inutilisable}</span>
          ) : (
            <>
              <span className="font-mono tabular-nums">
                {sac.eurParImage !== null ? `${formatEur(sac.eurParImage)} l’image (${formatUsd(sac.usdParImage)})` : "prix par image inconnu"}
              </span>
              <span>
                Réussite <strong className={cn("font-semibold", reussite.connue ? "text-ink" : "text-ink-2")}>{reussite.texte}</strong>
                {reussite.detail ? ` (${reussite.detail})` : ""}
              </span>
              {reel && (
                <span>
                  réel moyen <span className="font-mono tabular-nums text-ink">{formatEur(reel.eur)}</span>
                  {reel.partiel ? ` sur ${reel.sur}/${reel.images}` : ""}
                </span>
              )}
              {agregat && (
                <span>
                  {pluriel(agregat.images, "image", "images")}
                  {agregat.echecs > 0 ? `, ${pluriel(agregat.echecs, "échec", "échecs")}` : ""}
                  {derniere ? ` · ${derniere}` : ""}
                </span>
              )}
            </>
          )}
        </span>
      </button>
    </li>
  );
}
