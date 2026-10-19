// Jetons visuels du Studio. Direction C, comme le reste : tokens CSS, jamais
// de hex (AGENTS.md, invariants).

import type { ReactNode } from "react";
import type { EtatSacbase } from "@/lib/studioServeur";

export const btn =
  "inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-surface px-3 text-[13px] font-semibold text-[var(--ink2)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-50";

export const btnAcc =
  "inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--acc)] bg-[var(--acc)] px-3 text-[13px] font-semibold text-[var(--acc-ink)] transition-colors hover:bg-[var(--acc-hover)] disabled:cursor-not-allowed disabled:opacity-50";

export const champ =
  "w-full rounded-xl border border-[var(--border)] bg-surface px-3 py-2 text-[13.5px] text-[var(--ink)] outline-none transition-colors focus:border-[var(--acc)] focus:ring-2 focus:ring-[var(--acc-ring)]";

type Ton = "neutre" | "acc" | "pos" | "neg" | "warn";
const TONS: Record<Ton, string> = {
  neutre: "border-[var(--border)] bg-[var(--surface-2)] text-[var(--ink2)]",
  acc: "border-[var(--acc)] bg-[var(--acc-soft)] text-[var(--ink)]",
  pos: "border-[var(--pos)] bg-[var(--pos-soft)] text-[var(--pos)]",
  neg: "border-[var(--neg)] bg-[var(--neg-soft)] text-[var(--neg)]",
  warn: "border-[var(--warn)] bg-[var(--warn-soft)] text-[var(--ink)]",
};

export function Badge({ ton = "neutre", children, title }: { ton?: Ton; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex h-6 items-center rounded-full border px-2 font-mono text-[10.5px] font-semibold tracking-[0.04em] ${TONS[ton]}`}
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
    <div role="status" className="rounded-2xl border border-[var(--neg)] bg-[var(--neg-soft)] px-4 py-2.5 text-[13px] font-semibold text-[var(--ink)]">
      {texte}
    </div>
  );
}
