"use client";

import { useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { UserCircle, LogOut } from "lucide-react";
import { useDismissOnOutside } from "@/lib/useDismiss";
import { useIdentite } from "@/lib/useIdentite";

// Avatar utilisateur + menu compte, dans la barre supérieure (à droite du thème).
export default function AccountMenu() {
  const [open, setOpen] = useState(false);
  const ref = useDismissOnOutside<HTMLDivElement>(open, () => setOpen(false));
  const { initiale, nom } = useIdentite();

  return (
    <div ref={ref} className="relative flex items-center">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={nom ? `Mon compte (${nom})` : "Mon compte"}
        aria-expanded={open}
        className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-accent font-sans text-md font-bold text-accent-ink transition-transform hover:scale-105"
      >
        {initiale}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+10px)] w-[214px] overflow-hidden rounded-md border border-line bg-surface py-1.5 shadow-pop motion-safe:animate-pop [transform-origin:top_right]">
          <div className="flex items-center gap-3 border-b border-bg px-3.5 py-3">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-accent font-sans text-base font-bold text-accent-ink">
              {initiale}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-base font-bold text-ink">
                {nom || "Mon compte"}
              </span>
              <span className="block text-xs font-medium text-ink-3">
                Connecté
              </span>
            </span>
          </div>
          <Link
            href="/compte"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3.5 py-2.5 text-base font-semibold text-ink-2 transition-colors hover:bg-surface-2"
          >
            <UserCircle className="h-[18px] w-[18px]" strokeWidth={2} />
            Mon compte
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-base font-semibold text-neg transition-colors hover:bg-neg-soft"
          >
            <LogOut className="h-[18px] w-[18px]" strokeWidth={2} />
            Déconnexion
          </button>
        </div>
      )}
    </div>
  );
}
