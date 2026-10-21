import { statutColor } from "@/lib/statutColors";

// Badge de statut en lecture seule (couleurs en style inline).
export default function StatutBadge({ statut }: { statut: string }) {
  const c = statutColor(statut);
  return (
    <span
      className="inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-sm font-bold"
      style={{ backgroundColor: c.bg, color: c.ink }}
    >
      {statut}
    </span>
  );
}
