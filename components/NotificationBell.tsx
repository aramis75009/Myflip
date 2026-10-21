"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Bell, Check, ChevronRight, Clock, Info } from "lucide-react";

import { CountBadge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/cn";
import { useNotifications } from "@/lib/hooks";

// Pill colours per severity, by token classes. « action » (to do) keeps the
// orange of the « à comptabiliser » status, « info » (to watch) the warning
// amber; anything else falls back to the accent.
const SEV = {
  action: { classes: "bg-st-compta-soft text-st-compta-ink", Icon: AlertTriangle },
  info: { classes: "bg-warn-soft text-warn", Icon: Clock },
} as const;
const SEV_DEFAUT = { classes: "bg-accent-soft text-accent-text", Icon: Info };

/**
 * Bell + notifications panel, in the top bar. Live data from
 * /api/notifications; each reminder links to its filtered view. The panel is
 * a Radix popover: it stays inside the screen at 390 px (CA-01), closes on
 * Escape and outside click, and gives the focus back to the bell.
 */
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data } = useNotifications();

  const items = data?.items ?? [];
  const count = items.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Notifications${count > 0 ? ` (${count})` : ""}`}
          className={cn(
            "relative flex h-11 w-11 items-center justify-center rounded transition-colors duration-fast md:h-10 md:w-10",
            open ? "bg-surface-2 text-accent-text" : "text-ink-2 hover:bg-surface-2 hover:text-accent-text",
          )}
        >
          <Bell aria-hidden className="h-5 w-5" strokeWidth={2} />
          {count > 0 && (
            <CountBadge
              count={count}
              label={`${count} notification${count > 1 ? "s" : ""}`}
              className="absolute right-0.5 top-0.5 h-[18px] min-w-[18px] ring-2 ring-surface"
            />
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={10} className="overflow-hidden p-0" aria-label="Notifications">
        <div className="flex items-baseline gap-2.5 border-b border-line px-[18px] py-[15px]">
          <span className="text-md font-bold text-ink">Notifications</span>
          {count > 0 && <span className="text-xs font-semibold text-ink-3">{count} à traiter</span>}
        </div>

        {count === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 pb-10 pt-[38px] text-center">
            <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-pos-soft text-accent-text">
              <Check aria-hidden className="h-[26px] w-[26px]" strokeWidth={2.6} />
            </span>
            <span className="text-base font-semibold text-ink-2">Tout est à jour — rien à faire</span>
          </div>
        ) : (
          <div className="max-h-[calc(100dvh-10rem)] overflow-y-auto overscroll-contain p-1.5">
            {items.map((n) => {
              const sev = SEV[n.severity as keyof typeof SEV] ?? SEV_DEFAUT;
              const Icon = sev.Icon;
              return (
                <Link
                  key={n.key}
                  href={n.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 rounded-md px-3 py-3 transition-colors duration-fast hover:bg-surface-2"
                >
                  <span className={cn("flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded", sev.classes)}>
                    <Icon aria-hidden className="h-[17px] w-[17px]" strokeWidth={2.1} />
                  </span>
                  <span className="min-w-0 flex-1 leading-snug">
                    <span className="block text-base font-bold text-ink">{n.title}</span>
                    <span className="mt-px block text-sm font-medium text-ink-3">{n.message}</span>
                  </span>
                  <span className={cn("flex-shrink-0 rounded px-[9px] py-1 text-center text-sm font-bold", sev.classes)}>
                    {n.count}
                  </span>
                  <ChevronRight aria-hidden className="h-[17px] w-[17px] flex-shrink-0 text-ink-3" strokeWidth={2.2} />
                </Link>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
