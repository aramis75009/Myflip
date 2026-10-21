// Badge de canal de vente en lecture seule. Couleurs en inline (le JIT
// Tailwind ne compile pas les classes dynamiques). Utilisé par la page Stock.
//
// Aplat saturé aux couleurs de la plateforme, et non pastel : sur une ligne
// de tableau déjà porteuse d'un filet de statut et de trois colonnes de
// chiffres, c'est le seul élément qui doive se reconnaître à la teinte seule,
// sans être lu. Les valeurs viennent de `lib/canalColors.ts` — source unique,
// partagée avec le reste de l'app.

import { canalColor } from "@/lib/canalColors";

export default function CanalBadge({ canal }: { canal: string | null }) {
  if (!canal) return <span className="text-ink-3">—</span>;
  const c = canalColor(canal);
  return (
    <span
      className="inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 font-mono text-xs font-medium"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      {canal}
    </span>
  );
}
