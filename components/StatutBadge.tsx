import { cn } from "@/lib/cn";
import { styleStatut } from "@/lib/statutColors";

// Read-only status badge (soft background + ink text of the status).
export default function StatutBadge({ statut }: { statut: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-sm font-bold",
        styleStatut(statut).pastille,
      )}
    >
      {statut}
    </span>
  );
}
