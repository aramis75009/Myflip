"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu as IconeMenu } from "lucide-react";

import { CountBadge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { pluriel } from "@/lib/format";
import { useCompteAComptabiliser } from "@/lib/hooks";

import FeuillePlus from "./FeuillePlus";
import { ENTREES_DOCK, ENTREES_PLUS, estActif } from "./navigation";

// The accent fill sits on this inner tile, not on the whole cell.
const TUILE = "relative flex min-h-11 w-full flex-col items-center justify-center gap-1 rounded-md transition-colors duration-fast";
const CELLULE = "flex min-w-0 items-stretch px-1 py-1.5";

/**
 * Mobile dock: five fixed cells, no horizontal scroll (probe X9). Its DIRECT
 * children are the four links and the « Plus » button (e2e contract § 3.2);
 * the sheet is rendered outside the <nav>.
 */
export default function Dock() {
  const chemin = usePathname();
  const count = useCompteAComptabiliser();
  const [plus, setPlus] = useState(false);
  const plusActif = ENTREES_PLUS.some((e) => estActif(chemin, e.href));

  return (
    <>
      <nav
        aria-label="Navigation mobile"
        className="fixed inset-x-0 bottom-0 z-dock grid h-[calc(var(--dock-h)+env(safe-area-inset-bottom))] grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {ENTREES_DOCK.map((entree) => {
          const actif = estActif(chemin, entree.href);
          const Icone = entree.icone;
          return (
            <Link key={entree.href} href={entree.href} aria-current={actif ? "page" : undefined} className={CELLULE}>
              <span className={cn(TUILE, actif ? "bg-accent text-accent-ink" : "text-ink-2")}>
                <Icone aria-hidden className="h-[18px] w-[18px]" strokeWidth={actif ? 2.3 : 2} />
                <span className="max-w-full truncate text-xs font-medium">{entree.libelleCourt ?? entree.libelle}</span>
                {entree.compteur && count > 0 && (
                  <CountBadge
                    count={count}
                    label={`, ${pluriel(count, "article", "articles")}`}
                    className="absolute right-1 top-0.5 ring-2 ring-surface"
                  />
                )}
              </span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setPlus(true)}
          aria-haspopup="dialog"
          aria-expanded={plus}
          className={CELLULE}
        >
          <span className={cn(TUILE, plusActif ? "bg-accent-soft text-accent-text" : "text-ink-2")}>
            <IconeMenu aria-hidden className="h-[18px] w-[18px]" strokeWidth={2} />
            <span className="text-xs font-medium">Plus</span>
          </span>
        </button>
      </nav>
      <FeuillePlus open={plus} onOpenChange={setPlus} />
    </>
  );
}
