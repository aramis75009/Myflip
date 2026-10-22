"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";

import { ENTREES_PLUS, estActif, LIENS_LEGAUX } from "./navigation";

const LIGNE =
  "flex min-h-hit w-full items-center gap-3 rounded-md px-3 text-left text-base transition-colors duration-fast hover:bg-surface-2";

/** Mobile « Plus » sheet: every destination the dock has no room for. */
export default function FeuillePlus({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const chemin = usePathname();
  const fermer = () => onOpenChange(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Plus" side="bas">
      <nav aria-label="Autres pages" className="-mx-3 flex flex-col gap-0.5">
        {ENTREES_PLUS.map((entree) => {
          const actif = estActif(chemin, entree.href);
          const Icone = entree.icone;
          return (
            <Link
              key={entree.href}
              href={entree.href}
              onClick={fermer}
              aria-current={actif ? "page" : undefined}
              className={cn(LIGNE, actif ? "bg-accent-soft font-semibold text-accent-text" : "font-medium text-ink")}
            >
              <Icone aria-hidden className="h-[18px] w-[18px] flex-shrink-0 text-ink-2" strokeWidth={2} />
              <span className="min-w-0 flex-1">{entree.libelle}</span>
              {entree.ordinateur && <span className="text-xs text-ink-3">sur ordinateur</span>}
            </Link>
          );
        })}
      </nav>

      <div className="mt-3 border-t border-line pt-3">
        <div className="-mx-3">
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className={cn(LIGNE, "font-medium text-neg hover:bg-neg-soft")}
          >
            <LogOut aria-hidden className="h-[18px] w-[18px] flex-shrink-0" strokeWidth={2} />
            Se déconnecter
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-3">
          {LIENS_LEGAUX.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={fermer}
              className="inline-flex min-h-6 items-center py-1 text-xs text-ink-2 hover:text-ink"
            >
              {l.libelle}
            </Link>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-ink-2">© 2026 MyFlip</p>
      </div>
    </Sheet>
  );
}
