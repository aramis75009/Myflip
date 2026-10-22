// Jetons visuels partagés par les écrans de la mise en vente.
// Les boutons, champs et fenêtres viennent de `components/ui/` ; il ne reste
// ici que la carte, l'étiquette de section et la chip de sélection, propres à
// cet écran.

export const cardCls =
  "rounded-lg border border-line bg-surface shadow-pop";

export const labelCls =
  "text-xs font-bold uppercase tracking-[0.05em] text-ink-3";

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
      className={`inline-flex min-h-11 items-center justify-center rounded-lg border-[1.5px] px-4 text-base font-semibold transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${
        active
          ? "border-accent bg-accent text-accent-ink shadow-pop"
          : "border-line bg-surface text-ink-2 hover:border-line-strong"
      }`}
    >
      {value}
    </button>
  );
}
