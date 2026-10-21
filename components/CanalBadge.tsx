// Read-only sales channel badge: a square marker in the platform colour
// followed by the channel name in ink. The name is always written, the colour
// only helps to spot it (tokens --ch-*, lib/canalColors.ts).

import { cn } from "@/lib/cn";
import { styleCanal } from "@/lib/canalColors";

export default function CanalBadge({ canal }: { canal: string | null }) {
  if (!canal) return <span className="text-ink-3">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-mono text-xs font-medium text-ink">
      <span aria-hidden className={cn("size-2.5 shrink-0 rounded-xs", styleCanal(canal).repere)} />
      {canal}
    </span>
  );
}
