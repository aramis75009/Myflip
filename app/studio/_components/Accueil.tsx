"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Camera, CheckCheck, Scale, Search, Settings2, Sparkles, X } from "lucide-react";

import { Frame } from "@/components/console";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { cn } from "@/lib/cn";
import { pluriel } from "@/lib/format";
import { GENERATIONS, passeFiltres, type FiltreAccueil, type Generation } from "@/lib/studioCases";
import type { CarteColoris, DonneesGrille } from "@/lib/studioServeur";

import { CLE_RETOUR_CATALOGUE, FILTRES_VIDES, TITRES_GENRES, actionCarte, ecrireFiltres, regrouperParAction, type FiltresCatalogue, type GenreAction } from "../_parcours";
import { BandeauSacbase } from "../_ui";

// /studio — the catalogue as a LIST OF ACTIONS: every colourway says, verb
// first, what is left to do (judge, photograph, generate), grouped in work
// order. Generation, filter and search live in the URL (?generation=V2&
// filtre=a_juger&q=…), so a reload or the way back from a sheet keeps them.

const FILTRES: { id: FiltreAccueil | null; nom: string }[] = [
  { id: null, nom: "Tous" },
  { id: "a_juger", nom: "À juger" },
  { id: "a_photographier", nom: "À photographier" },
  { id: "doublons", nom: "Doublons chez toi" },
];

const ICONES: Record<GenreAction, typeof Scale> = {
  juger: Scale,
  photographier: Camera,
  generer: Sparkles,
  rien: CheckCheck,
};

const TONS: Record<GenreAction, string> = {
  juger: "bg-warn-soft text-ink",
  photographier: "bg-accent text-accent-ink",
  generer: "bg-accent-soft text-ink",
  rien: "bg-surface-2 text-ink-2",
};

const sansAccents = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export default function Accueil({ donnees, filtresInitiaux }: { donnees: DonneesGrille; filtresInitiaux: FiltresCatalogue }) {
  const [f, setF] = useState<FiltresCatalogue>(filtresInitiaux);
  const changer = (x: Partial<FiltresCatalogue>) => setF((p) => ({ ...p, ...x }));

  // URL and way back from a sheet, without a server round trip (history API, as Next allows).
  useEffect(() => {
    const qs = ecrireFiltres(f);
    const url = qs ? `/studio?${qs}` : "/studio";
    if (`${window.location.pathname}${window.location.search}` !== url) window.history.replaceState(window.history.state, "", url);
    try {
      if (qs) window.sessionStorage.setItem(CLE_RETOUR_CATALOGUE, qs);
      else window.sessionStorage.removeItem(CLE_RETOUR_CATALOGUE);
    } catch {
      // Storage unavailable: the sheet goes back to the plain catalogue.
    }
  }, [f]);

  const { cartes } = donnees;
  const q = sansAccents(f.q.trim());
  const duTexte = (c: CarteColoris) => !q || sansAccents(`${c.coloris} ${c.modele} ${c.cle}`).includes(q);
  const deGeneration = cartes.filter((c) => passeFiltres(c, f.generation, null) && duTexte(c));
  const visibles = deGeneration.filter((c) => passeFiltres(c, null, f.filtre));
  const groupes = regrouperParAction(visibles);

  const doublons = visibles.filter((c) => (c.chezMoi ?? 0) >= 2).length;
  const aPhotographier = visibles.filter((c) => passeFiltres(c, null, "a_photographier")).length;
  const aJuger = visibles.reduce((n, c) => n + c.aJuger, 0);
  const filtre = f.generation !== null || f.filtre !== null || f.q.trim() !== "";

  return (
    <Frame>
      <BandeauSacbase etat={donnees.sacbase} />

      <header className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-[-0.02em] text-ink">Coloris</h1>
          <p className="mt-1 text-base text-ink-2">
            {visibles.length} coloris · {pluriel(aJuger, "image", "images")} à juger · {aPhotographier} à photographier ·{" "}
            {pluriel(doublons, "doublon", "doublons")} chez toi
            {donnees.orphelines > 0 && ` · ${pluriel(donnees.orphelines, "photo non rattachée", "photos non rattachées")}`}
          </p>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link href="/parametres?onglet=studio">
            <Settings2 size={15} aria-hidden /> Réglages du Studio
          </Link>
        </Button>
      </header>

      {donnees.nbAngles === 0 && (
        <p role="status" className="rounded-md border border-warn bg-warn-soft px-4 py-2.5 text-base text-ink">
          Aucun prompt d’angle : rien ne peut être généré.{" "}
          <Link href="/parametres?onglet=studio" className="font-semibold underline underline-offset-2">
            Ajoute-les dans les Réglages du Studio
          </Link>
          .
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="inline-flex gap-0.5 rounded-md bg-surface-2 p-1" role="group" aria-label="Génération">
          {[null, ...GENERATIONS].map((g: Generation | null) => {
            const actif = f.generation === g;
            const n = cartes.filter((c) => passeFiltres(c, g, null) && duTexte(c)).length;
            return (
              <button
                key={g ?? "toutes"}
                type="button"
                aria-pressed={actif}
                onClick={() => changer({ generation: g })}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-sm px-3 text-base font-semibold transition-colors duration-fast",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                  actif ? "bg-surface text-ink ring-1 ring-inset ring-line-strong" : "text-ink-2 hover:text-ink",
                )}
              >
                {g ?? "Toutes gén."}
                <span className="font-mono text-xs font-medium text-ink-2">{n}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtre">
          {FILTRES.map((x) => {
            const actif = f.filtre === x.id;
            const n = deGeneration.filter((c) => passeFiltres(c, null, x.id)).length;
            return (
              <button
                key={x.id ?? "tous"}
                type="button"
                aria-pressed={actif}
                onClick={() => changer({ filtre: x.id })}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-base font-semibold transition-colors duration-fast",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                  actif ? "border-ink bg-ink text-bg" : "border-line bg-surface text-ink hover:border-line-strong",
                )}
              >
                {x.nom}
                <span className={cn("font-mono text-xs font-medium", actif ? "text-bg" : "text-ink-2")}>{n}</span>
              </button>
            );
          })}
        </div>

        <label className="ml-auto flex h-10 min-w-[220px] flex-[0_1_300px] items-center gap-2.5 rounded-md border border-line-strong bg-surface px-3 text-base text-ink-3 focus-within:border-focus focus-within:ring-2 focus-within:ring-focus">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Rechercher un coloris</span>
          <input
            type="search"
            value={f.q}
            onChange={(e) => changer({ q: e.target.value })}
            placeholder="Rechercher un coloris…"
            className="min-w-0 flex-1 bg-transparent text-ink placeholder:text-ink-3 focus-visible:outline-none"
          />
        </label>
      </div>

      {visibles.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line-strong">
          <EmptyState
            titre={
              cartes.length === 0
                ? "Aucun coloris dans SacBase pour l’instant."
                : `Aucun coloris${f.q.trim() ? ` pour « ${f.q.trim()} »` : ""}${f.generation ? ` en ${f.generation}` : ""}${
                    f.filtre ? ` dans « ${FILTRES.find((x) => x.id === f.filtre)?.nom} »` : ""
                  }.`
            }
            description={cartes.length === 0 ? "Les coloris arrivent de SacBase dès qu’il répond." : "Change de filtre ou efface-les pour revoir tout le catalogue."}
            action={
              filtre ? (
                <Button variant="secondary" onClick={() => setF(FILTRES_VIDES)}>
                  <X size={15} aria-hidden /> Effacer les filtres
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groupes.map((g) => (
            <section key={g.genre} aria-labelledby={`groupe-${g.genre}`}>
              <h2 id={`groupe-${g.genre}`} className="mb-2.5 flex items-baseline gap-2 text-base font-semibold text-ink">
                {TITRES_GENRES[g.genre]}
                <span className="font-mono text-xs font-medium text-ink-2">{g.cartes.length}</span>
              </h2>
              <ul className="grid gap-3 min-[1100px]:grid-cols-2 min-[1600px]:grid-cols-3">
                {g.cartes.map((c) => (
                  <li key={c.cle}>
                    <Carte c={c} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Frame>
  );
}

function Carte({ c }: { c: CarteColoris }) {
  const [vignetteKo, setVignetteKo] = useState(false);
  const action = actionCarte(c);
  const Icone = ICONES[action.genre];
  const chezMoi = c.chezMoi ?? 0;
  const stock =
    c.chezMoi === null
      ? "hors catalogue SacBase"
      : [chezMoi ? `${chezMoi} chez toi` : null, c.vendus ? `vendu ×${c.vendus}` : null].filter(Boolean).join(" · ") || "jamais acheté";
  const prises = c.cases - c.libres;

  return (
    <Link
      href={`/studio/${encodeURIComponent(c.cle)}`}
      className={cn(
        "group flex h-full gap-4 rounded-lg border border-line bg-surface p-3 text-ink transition-colors duration-fast hover:border-line-strong",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
      )}
    >
      <div className="relative flex h-[132px] w-[104px] flex-none items-center justify-center overflow-hidden rounded-md bg-surface-2">
        {c.vignette && !vignetteKo ? (
          // eslint-disable-next-line @next/next/no-img-element -- relais privé /api/studio/vignette, pas d'optimisation Next
          <img src={c.vignette} alt="" loading="lazy" onError={() => setVignetteKo(true)} className="block h-[124px] w-auto object-contain" />
        ) : (
          <span className="rounded-xs bg-surface px-1.5 py-0.5 font-mono text-xs text-ink-2">{c.modele || "?"}</span>
        )}
        {c.generation && (
          <span className="absolute left-1.5 top-1.5 rounded-xs bg-surface px-1.5 py-px font-mono text-xs font-semibold text-ink-2">{c.generation}</span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="min-w-0 truncate text-md font-semibold">{c.coloris || c.cle}</span>
            <span className="flex-none rounded-xs bg-surface-2 px-1.5 py-px font-mono text-xs text-ink-2">{c.modele}</span>
            {chezMoi >= 2 && <span className="flex-none rounded-xs bg-accent-soft px-1.5 py-px text-xs font-semibold text-ink">Doublon ×{chezMoi}</span>}
          </div>
          <div className="mt-0.5 truncate text-sm text-ink-2">{stock}</div>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 text-sm">
          <div>
            <dt className="text-ink-2">Vraies photos</dt>
            <dd className="font-mono font-semibold">{c.prises ? `${c.prises} / 15` : "—"}</dd>
          </div>
          <div>
            <dt className="text-ink-2">Variantes utilisées</dt>
            <dd className="font-mono font-semibold">{c.cases ? `${prises} / ${c.cases}` : "—"}</dd>
          </div>
        </dl>

        <div className={cn("mt-auto flex min-h-10 items-center gap-2.5 rounded-md px-3 py-1.5", TONS[action.genre])}>
          <Icone size={16} aria-hidden className="flex-none" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-semibold">{action.phrase}</span>
            <span className="block truncate text-xs">{action.detail}</span>
          </span>
          {action.genre !== "rien" && <ArrowRight size={15} aria-hidden className="flex-none transition-transform duration-fast group-hover:translate-x-0.5" />}
        </div>
      </div>
    </Link>
  );
}
