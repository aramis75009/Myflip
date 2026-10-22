"use client";

import { Fragment, type ReactElement } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogOut, PanelLeft } from "lucide-react";

import { CountBadge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { pluriel } from "@/lib/format";
import { useCompteAComptabiliser } from "@/lib/hooks";

import { basculerMenu, estActif, LIENS_LEGAUX, NAVIGATION, useMenuReplie } from "./navigation";

const PREMIER_STUDIO = NAVIGATION.findIndex((e) => e.section === "studio");

const LIGNE =
  "relative flex min-h-[46px] items-center gap-[11px] rounded-md px-3 transition-colors duration-fast replie:h-12 replie:justify-center replie:px-0";

/** In the rail only: the label is visually hidden, the tooltip shows it. */
function InfoRail({ replie, contenu, children }: { replie: boolean | null; contenu: string; children: ReactElement }) {
  if (!replie) return children;
  return (
    <Tooltip contenu={contenu} side="right">
      {children}
    </Tooltip>
  );
}

/**
 * Desktop side menu, collapsible to an icon rail.
 *
 * The active link carries its own background (no measured indicator): it is
 * right in the server HTML, before hydration (probe M1). In the rail the
 * label stays in the link as `sr-only` text, so the accessible name is still
 * the text (and the counter), never an aria-label.
 */
export default function MenuLateral() {
  const chemin = usePathname();
  const count = useCompteAComptabiliser();
  const replie = useMenuReplie();

  return (
    <aside className="fixed inset-y-0 left-0 z-sticky hidden w-[var(--sidebar-w)] flex-col border-r border-line bg-surface px-3 pb-[18px] pt-3.5 transition-[width] duration-base ease-out md:flex">
      <button
        type="button"
        onClick={basculerMenu}
        aria-expanded={replie === null ? undefined : !replie}
        className="absolute -right-3.5 top-1/2 z-raised flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface text-ink-2 shadow-pop transition-colors duration-fast hover:border-line-strong hover:text-accent-text"
      >
        <PanelLeft aria-hidden className="h-[15px] w-[15px]" strokeWidth={2} />
        <span className="sr-only replie:hidden">Réduire le menu</span>
        <span className="sr-only hidden replie:inline">Agrandir le menu</span>
      </button>

      {/* Accent tile + text wordmark. The SVGs of public/logo-atlas/ carry
          the old green in hard and stay for the favicon and iOS icon only. */}
      <div className="mb-3.5 flex items-center gap-2.5 px-1 pb-1 replie:justify-center replie:px-0">
        <span
          aria-hidden="true"
          className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-md bg-accent text-md font-bold text-accent-ink"
        >
          M
        </span>
        <span className="min-w-0 flex-1 replie:hidden">
          <span className="block text-md font-bold tracking-[-0.02em] text-ink">MyFlip</span>
          <span className="block font-mono text-xs tracking-[0.14em] text-ink-3">CONSOLE REVENTE</span>
        </span>
      </div>

      <nav aria-label="Navigation principale" className="flex min-h-0 flex-col gap-[3px] overflow-y-auto">
        {NAVIGATION.map((entree, index) => {
          const actif = estActif(chemin, entree.href);
          const Icone = entree.icone;
          const avecCompteur = entree.compteur && count > 0;
          return (
            <Fragment key={entree.href}>
              {index === PREMIER_STUDIO && <div role="separator" className="mx-3 my-1.5 border-t border-line" />}
              <InfoRail replie={replie} contenu={entree.libelle}>
                <Link
                  href={entree.href}
                  data-active={actif}
                  aria-current={actif ? "page" : undefined}
                  className={cn(
                    LIGNE,
                    actif ? "bg-accent font-bold text-accent-ink" : "font-medium text-ink-2 hover:bg-surface-2 hover:text-ink",
                  )}
                >
                  <Icone aria-hidden className="h-[18px] w-[18px] flex-shrink-0" strokeWidth={actif ? 2.3 : 2} />
                  <span className="min-w-0 flex-1 truncate text-base replie:sr-only">{entree.libelle}</span>
                  {avecCompteur && (
                    <CountBadge
                      count={count}
                      label={`, ${pluriel(count, "article", "articles")}`}
                      className="ring-2 ring-surface replie:absolute replie:right-1.5 replie:top-1"
                    />
                  )}
                </Link>
              </InfoRail>
            </Fragment>
          );
        })}
      </nav>

      <div className="mt-auto pt-3">
        <InfoRail replie={replie} contenu="Se déconnecter">
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className={cn(LIGNE, "w-full text-left font-medium text-ink-2 hover:bg-surface-2 hover:text-ink")}
          >
            <LogOut aria-hidden className="h-[18px] w-[18px] flex-shrink-0" strokeWidth={2} />
            <span className="min-w-0 flex-1 truncate text-base replie:sr-only">Se déconnecter</span>
          </button>
        </InfoRail>
        {/* Collapsed: the legal links move to the avatar menu (AccountMenu). */}
        <div className="mt-2 border-t border-line px-3 pt-3 replie:hidden">
          <div className="flex flex-wrap gap-x-3">
            {LIENS_LEGAUX.map((l) => (
              <Link key={l.href} href={l.href} className="inline-flex min-h-6 items-center py-1 text-xs text-ink-2 hover:text-ink">
                {l.libelle}
              </Link>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-ink-2">© 2026 MyFlip</p>
        </div>
      </div>
    </aside>
  );
}
