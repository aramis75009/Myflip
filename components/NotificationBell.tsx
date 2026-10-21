"use client";
// design-tokens-dette: R10 → L2a

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Bell, Check, ChevronRight, Clock } from "lucide-react";
import { useNotifications } from "@/lib/hooks";
import { useDismissOnOutside } from "@/lib/useDismiss";

// Accent + fond de pastille par sévérité. Les valeurs vivent dans globals.css
// (--alert / --notice) et sont volontairement identiques en clair et en sombre :
// un badge de sévérité doit se reconnaître à la même couleur d'un thème à
// l'autre, comme les statuts de lib/statutColors.ts.
//
// Posées en style inline et non en classe Tailwind : le JIT ne compile pas
// `bg-[${x}]` construit à l'exécution.
const SEV = {
  action: {
    accent: "rgb(var(--danger))",
    tint: "rgb(var(--neg-soft))",
    Icon: AlertTriangle,
  },
  info: { accent: "rgb(var(--warn))", tint: "rgb(var(--warn-soft))", Icon: Clock },
} as const;

// Cloche + panneau de notifications, intégrée dans la barre supérieure.
// Données live via /api/notifications ; chaque rappel pointe vers sa vue filtrée.
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data } = useNotifications();
  const ref = useDismissOnOutside<HTMLDivElement>(open, () => setOpen(false));

  const items = data?.items ?? [];
  const count = items.length;

  return (
    <div ref={ref} className="relative flex items-center">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${count > 0 ? ` (${count})` : ""}`}
        aria-expanded={open}
        className={`relative flex h-10 w-10 items-center justify-center rounded transition-colors ${
          open ? "bg-surface-2 text-accent-text" : "text-ink-2 hover:bg-surface-2 hover:text-accent-text"
        }`}
      >
        <Bell className="h-5 w-5" strokeWidth={2} />
        {count > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded border-2 border-surface bg-danger px-1 font-sans text-xs font-bold text-white">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+10px)] w-[min(384px,92vw)] overflow-hidden rounded-lg border border-line bg-surface shadow-pop motion-safe:animate-pop [transform-origin:top_right]">
          <div className="flex items-center justify-between gap-2.5 border-b border-bg px-[18px] py-[15px]">
            <div className="flex items-baseline gap-2.5">
              <span className="font-sans text-md font-bold text-ink">
                Notifications
              </span>
              {count > 0 && (
                <span className="text-xs font-semibold text-ink-3">
                  {count} à traiter
                </span>
              )}
            </div>
          </div>

          {count === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 pb-10 pt-[38px] text-center">
              <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-pos-soft text-accent-text">
                <Check className="h-[26px] w-[26px]" strokeWidth={2.6} />
              </span>
              <span className="text-base font-semibold text-ink-2">
                Tout est à jour — rien à faire
              </span>
            </div>
          ) : (
            <div className="max-h-[min(60vh,420px)] overflow-y-auto p-1.5">
              {items.map((n) => {
                const sev = SEV[n.severity as keyof typeof SEV] ?? SEV.info;
                const Icon = sev.Icon;
                return (
                  <Link
                    key={n.key}
                    href={n.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 rounded-md px-3 py-3 transition-colors hover:bg-surface-2"
                  >
                    <span
                      className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded"
                      style={{ background: sev.tint }}
                    >
                      <Icon
                        className="h-[17px] w-[17px]"
                        strokeWidth={2.1}
                        style={{ color: sev.accent }}
                      />
                    </span>
                    <span className="min-w-0 flex-1 leading-[1.35]">
                      <span className="block text-base font-bold text-ink">
                        {n.title}
                      </span>
                      <span className="mt-px block text-sm font-medium text-ink-3">
                        {n.message}
                      </span>
                    </span>
                    <span
                      className="flex-shrink-0 rounded px-[9px] py-1 text-center font-sans text-sm font-bold"
                      style={{ color: sev.accent, background: sev.tint }}
                    >
                      {n.count}
                    </span>
                    <ChevronRight
                      className="h-[17px] w-[17px] flex-shrink-0 text-ink-3"
                      strokeWidth={2.2}
                    />
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
