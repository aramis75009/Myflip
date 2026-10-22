// design-tokens-dette: R13 → M8
// Jetons visuels du Studio. Direction C, comme le reste : tokens CSS, jamais
// de hex (AGENTS.md, invariants).

import type { ReactNode } from "react";
import type { EtatSacbase } from "@/lib/studioServeur";

export const btn =
  "inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-semibold text-ink-2 transition-colors hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-50";

export const btnAcc =
  "inline-flex h-9 items-center gap-1.5 rounded-lg border border-accent bg-accent px-3 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50";

export const champ =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-base text-ink outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-focus";

type Ton = "neutre" | "acc" | "pos" | "neg" | "warn";
const TONS: Record<Ton, string> = {
  neutre: "border-line bg-surface-2 text-ink-2",
  acc: "border-accent bg-accent-soft text-ink",
  pos: "border-pos bg-pos-soft text-pos",
  neg: "border-neg bg-neg-soft text-neg",
  warn: "border-warn bg-warn-soft text-ink",
};

export function Badge({ ton = "neutre", children, title }: { ton?: Ton; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex h-6 items-center rounded-full border px-2 font-mono text-xs font-semibold tracking-[0.04em] ${TONS[ton]}`}
    >
      {children}
    </span>
  );
}

/** Bandeau « SacBase injoignable » (spec §9). Rien quand la synchro est vivante. */
export function BandeauSacbase({ etat }: { etat: EtatSacbase }) {
  if (etat.kind === "live") return null;
  const texte =
    etat.kind === "stale"
      ? `SacBase injoignable (${etat.error}) — catalogue de ${new Date(etat.fetchedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}.`
      : etat.reason === "non-configure"
        ? "SacBase non configuré (SACBASE_URL / SACBASE_STUDIO_TOKEN) — seuls les coloris déjà ouverts sont listés."
        : "SacBase injoignable — seuls les coloris déjà ouverts sont listés, les nouvelles photos restent non rattachées.";
  return (
    <div role="status" className="rounded-md border border-neg bg-neg-soft px-4 py-2.5 text-sm font-semibold text-ink">
      {texte}
    </div>
  );
}
