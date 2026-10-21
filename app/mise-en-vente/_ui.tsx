// design-tokens-dette: R12 R13 → M3
// Jetons visuels partagés par les écrans de la mise en vente.
// Relevés sur Direction C : les valeurs au demi-pixel viennent des maquettes,
// pas de tailwind.config.ts, qui décrit encore l'ancien design.

export const cardCls =
  "rounded-lg border border-line bg-surface shadow-pop";

export const labelCls =
  "text-xs font-bold uppercase tracking-[0.05em] text-ink-3";

export const inputCls =
  "w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-base text-ink outline-none transition-colors focus:border-accent";

export const btnGhost =
  "inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-base font-semibold text-ink-2 transition-colors hover:border-line-strong";

/** Chip de sélection (marque, catégorie, taille, état, matière). 44px = cible tactile. */
export function Chip({
  value,
  active,
  onClick,
}: {
  value: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-11 items-center justify-center rounded-lg border-[1.5px] px-4 text-base font-semibold transition-all ${
        active
          ? "border-accent bg-accent text-accent-ink shadow-pop"
          : "border-line bg-surface text-ink-2 hover:border-line-strong"
      }`}
    >
      {value}
    </button>
  );
}
