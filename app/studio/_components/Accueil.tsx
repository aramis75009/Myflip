"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { Frame } from "@/components/console";
import { GENERATIONS, passeFiltres, type FiltreAccueil, type Generation } from "@/lib/studioCases";
import type { CarteColoris, DonneesGrille } from "@/lib/studioServeur";
import { BandeauSacbase } from "../_ui";

// /studio — l'accueil : un coloris par carte, triable par génération (comme
// SacBase), avec les trois filtres qui disent quoi faire ensuite.

const FILTRES: { id: FiltreAccueil | null; nom: string }[] = [
  { id: null, nom: "Tous" },
  { id: "doublons", nom: "Doublons chez moi" },
  { id: "a_juger", nom: "À juger" },
  { id: "a_photographier", nom: "À photographier" },
];

const pl = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;
const sansAccents = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export default function Accueil({ donnees }: { donnees: DonneesGrille }) {
  const [generation, setGeneration] = useState<Generation | null>(null);
  const [filtre, setFiltre] = useState<FiltreAccueil | null>(null);
  const [recherche, setRecherche] = useState("");

  const { cartes } = donnees;
  const q = sansAccents(recherche.trim());
  const duTexte = (c: CarteColoris) => !q || sansAccents(`${c.coloris} ${c.modele} ${c.cle}`).includes(q);
  const deGeneration = cartes.filter((c) => passeFiltres(c, generation, null) && duTexte(c));
  const visibles = deGeneration.filter((c) => passeFiltres(c, null, filtre));

  const doublons = visibles.filter((c) => (c.chezMoi ?? 0) >= 2).length;
  const aPhotographier = visibles.filter((c) => passeFiltres(c, null, "a_photographier")).length;

  return (
    <Frame>
      <BandeauSacbase etat={donnees.sacbase} />

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="inline-flex gap-0.5 rounded-2xl border border-[var(--border)] bg-surface p-1" role="group" aria-label="Génération">
          {[null, ...GENERATIONS].map((g) => {
            const actif = generation === g;
            const n = cartes.filter((c) => passeFiltres(c, g, null) && duTexte(c)).length;
            return (
              <button
                key={g ?? "toutes"}
                type="button"
                aria-pressed={actif}
                onClick={() => setGeneration(g)}
                className={`inline-flex h-[38px] items-center gap-[7px] rounded-xl px-3.5 text-[14.5px] font-semibold transition-colors ${
                  actif ? "bg-[var(--ink)] text-[var(--bg)]" : "text-[var(--ink)] hover:bg-[var(--surface-2)]"
                }`}
              >
                {g ?? "Toutes gén."}
                <span className="font-mono text-[11.5px] font-medium opacity-75">{n}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtre">
          {FILTRES.map((f) => {
            const actif = filtre === f.id;
            const n = deGeneration.filter((c) => passeFiltres(c, null, f.id)).length;
            return (
              <button
                key={f.id ?? "tous"}
                type="button"
                aria-pressed={actif}
                onClick={() => setFiltre(f.id)}
                className={`inline-flex h-10 items-center gap-[7px] rounded-full border px-[15px] text-[14px] font-semibold transition-colors ${
                  actif
                    ? "border-[var(--acc)] bg-[var(--acc)] text-[var(--acc-ink)]"
                    : "border-[var(--border)] bg-surface text-[var(--ink)] hover:border-[var(--border-strong)]"
                }`}
              >
                {f.nom}
                <span className="font-mono text-[11.5px] font-medium opacity-75">{n}</span>
              </button>
            );
          })}
        </div>

        <label className="ml-auto flex h-11 min-w-[200px] flex-[0_1_280px] items-center gap-2.5 rounded-[14px] border border-[var(--border)] bg-surface px-3.5 text-[14px] text-[var(--muted)] focus-within:border-[var(--acc)]">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un coloris…"
            className="min-w-0 flex-1 bg-transparent text-[var(--ink)] outline-none placeholder:text-[var(--muted)]"
          />
        </label>
      </div>

      <p className="px-1 text-[14px] text-[var(--ink2)]">
        {visibles.length} coloris · {pl(doublons, "doublon")} chez toi · {aPhotographier} à photographier
        {donnees.nbAngles === 0 && (
          <>
            {" "}·{" "}
            <Link href="/parametres?onglet=studio" className="font-semibold text-[var(--ink)] underline underline-offset-2">
              aucun prompt d’angle : ajoute-les dans Prompts
            </Link>
          </>
        )}
        {donnees.orphelines > 0 && ` · ${pl(donnees.orphelines, "photo")} non rattachée${donnees.orphelines > 1 ? "s" : ""}`}
      </p>

      {visibles.length === 0 ? (
        <div className="rounded-[22px] border border-dashed border-[var(--border-strong)] p-8 text-center text-[14px] text-[var(--ink2)]">
          Aucun coloris ne correspond à ces filtres.
        </div>
      ) : (
        <div className="grid gap-[14px] [grid-template-columns:repeat(auto-fill,minmax(226px,1fr))]">
          {visibles.map((c) => (
            <Carte key={c.cle} c={c} />
          ))}
        </div>
      )}
    </Frame>
  );
}

function Carte({ c }: { c: CarteColoris }) {
  const [vignetteKo, setVignetteKo] = useState(false);
  const chezMoi = c.chezMoi ?? 0;
  const aPhotographier = chezMoi > 0 && c.prises === 0;
  const doublon = chezMoi >= 2;

  let etat = "Voir la fiche";
  let ton: "neutre" | "warn" | "acc" | "muet" = "neutre";
  if (c.aJuger > 0) {
    etat = `${pl(c.aJuger, "image")} à juger`;
    ton = "warn";
  } else if (aPhotographier) {
    etat = "À photographier";
    ton = "warn";
  } else if (c.prochain && c.prises > 0) {
    etat = `Préparer ${c.prochain}`;
    ton = "acc";
  } else if (c.prises === 0) {
    etat = "Aucun sac à préparer";
    ton = "muet";
  }
  const etatCls = {
    neutre: "bg-[var(--surface-2)] text-[var(--ink)]",
    warn: "bg-[var(--warn-soft)] text-[var(--ink)]",
    acc: "bg-[var(--acc)] text-[var(--acc-ink)]",
    muet: "bg-[var(--surface-2)] text-[var(--ink2)]",
  }[ton];

  const stock =
    c.chezMoi === null
      ? "hors catalogue SacBase"
      : [chezMoi ? `${chezMoi} chez toi` : null, c.vendus ? `vendu ×${c.vendus}` : null].filter(Boolean).join(" · ") || "jamais acheté";
  const pris = c.cases - c.libres;

  return (
    <Link
      href={`/studio/${encodeURIComponent(c.cle)}`}
      className="group flex flex-col overflow-hidden rounded-[22px] border border-[var(--border)] bg-surface text-[var(--ink)] transition-colors hover:border-[var(--border-strong)]"
    >
      <div className="relative flex h-[196px] items-center justify-center bg-surface">
        {c.vignette && !vignetteKo ? (
          // eslint-disable-next-line @next/next/no-img-element -- relais privé /api/studio/vignette, pas d'optimisation Next
          <img src={c.vignette} alt="" loading="lazy" onError={() => setVignetteKo(true)} className="block h-[180px] w-auto object-contain" />
        ) : (
          <div className="flex h-[170px] w-[132px] items-center justify-center rounded-[14px] bg-[repeating-linear-gradient(135deg,var(--surface-2)_0_8px,var(--raise)_8px_16px)]">
            <span className="rounded-md bg-surface px-1.5 py-0.5 font-mono text-[10.5px] text-[var(--ink2)]">{c.modele || "?"}</span>
          </div>
        )}
        {(doublon || aPhotographier) && (
          <span
            className={`absolute left-2.5 top-2.5 inline-flex h-6 items-center rounded-lg px-2 text-[12px] font-bold ${
              doublon ? "bg-[var(--acc)] text-[var(--acc-ink)]" : "bg-[var(--warn-soft)] text-[var(--ink)]"
            }`}
          >
            {doublon ? `Doublon ×${chezMoi}` : "À photographier"}
          </span>
        )}
        {c.generation && (
          <span className="absolute right-2.5 top-2.5 inline-flex h-6 items-center rounded-lg border border-[var(--border)] bg-surface px-[7px] font-mono text-[11.5px] font-semibold text-[var(--ink2)]">
            {c.generation}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2.5 border-t border-[var(--border)] px-4 pb-4 pt-3.5">
        <div>
          <div className="flex items-center gap-2">
            <span className="min-w-0 truncate text-[16.5px] font-semibold">{c.coloris || c.cle}</span>
            <span className="flex-none rounded-md bg-[var(--surface-2)] px-1.5 py-px font-mono text-[11.5px] text-[var(--ink2)]">{c.modele}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-[var(--ink2)]">
            <span className={`h-[7px] w-[7px] flex-none rounded-full ${chezMoi ? "bg-[var(--acc)]" : "bg-[var(--border-strong)]"}`} aria-hidden="true" />
            <span className="min-w-0 truncate">{stock}</span>
          </div>
        </div>
        <div className="flex flex-col gap-1.5 text-[13.5px]">
          <div className="flex justify-between gap-2.5">
            <span className="text-[var(--ink2)]">Vraies photos</span>
            <span className="font-mono font-semibold">{c.prises || "—"}</span>
          </div>
          <div className="flex justify-between gap-2.5">
            <span className="text-[var(--ink2)]">Variantes libres</span>
            <span className="font-mono font-semibold">{c.cases ? `${c.libres} / ${c.cases}` : "—"}</span>
          </div>
          <div className="h-[5px] overflow-hidden rounded-[3px] bg-[var(--surface-2)]" aria-hidden="true">
            <div className="h-[5px] rounded-[3px] bg-[var(--ink2)]" style={{ width: c.cases ? `${Math.round((pris / c.cases) * 100)}%` : "0%" }} />
          </div>
        </div>
        <div className={`mt-auto flex h-9 items-center justify-between gap-2 rounded-xl px-3 text-[13.5px] font-semibold ${etatCls}`}>
          <span className="min-w-0 truncate">{etat}</span>
          <ArrowRight size={15} aria-hidden="true" className="flex-none transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </Link>
  );
}
