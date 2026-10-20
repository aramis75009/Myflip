"use client";

import { Fragment, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Package,
  Tag,
  FileText,
  Calendar,
  ShoppingBag,
  BarChart3,
  Settings,
  UserCircle,
  FlaskConical,
  LogOut,
  PanelLeft,
  type LucideIcon,
} from "lucide-react";
import { useCompteAComptabiliser } from "@/lib/hooks";

type NavItem = {
  href: string;
  label: string;
  short: string;
  icon: LucideIcon;
  badge?: boolean;
  // Entrée « secondaire » : séparée du reste dans la sidebar desktop, absente
  // du dock mobile (le Studio est une vue desktop).
  section?: "secondaire";
};

// (cf. plus bas) et n'existe pas du tout en mobile, la scène 3D étant une vue
// desktop. Le lister ici obligerait les deux rendus à l'exclure au filtre.
const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", short: "DASH", icon: LayoutDashboard },
  { href: "/stock", label: "Stock", short: "STOCK", icon: Package },
  { href: "/mise-en-vente", label: "Mise en vente", short: "VENTE", icon: Tag },
  {
    href: "/a-comptabiliser",
    label: "À comptabiliser",
    short: "COMPTA",
    icon: FileText,
    badge: true,
  },
  { href: "/calendrier", label: "Calendrier", short: "AGENDA", icon: Calendar },
  { href: "/commandes", label: "Commandes", short: "CMD", icon: ShoppingBag },
  { href: "/statistiques", label: "Statistiques", short: "STATS", icon: BarChart3 },
  { href: "/parametres", label: "Prompts", short: "PROMPT", icon: Settings },
  { href: "/compte", label: "Mon compte", short: "MOI", icon: UserCircle },
  {
    href: "/studio",
    label: "Studio",
    short: "STUDIO",
    icon: FlaskConical,
    section: "secondaire",
  },
];

// Premier élément secondaire : c'est devant lui qu'on pose l'unique séparateur.
const PREMIER_SECONDAIRE = NAV.findIndex((item) => item.section === "secondaire");
// Le dock mobile n'affiche que les entrées principales.
const NAV_DOCK = NAV.filter((item) => item.section !== "secondaire");

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Libellé d'un item de la sidebar desktop : texte complet quand elle est
// dépliée, code mono quand elle est repliée en rail. La bascule est purement
// CSS (`.sb-hide-collapsed` / `.sb-only-collapsed` dans globals.css).
function ItemLabel({ label, short }: { label: string; short: string }) {
  return (
    <>
      <span className="sb-hide-collapsed flex-1 truncate text-[13.5px]">
        {label}
      </span>
      <span className="sb-only-collapsed font-mono text-[8.5px] tracking-[0.04em]">
        {short}
      </span>
    </>
  );
}

// Item du dock mobile. Le fond d'accent est porté par ce jeton intérieur et
// non par le lien : sur une nav qui défile, un aplat pleine hauteur se lirait
// comme une colonne coupée en bord d'écran.
const DOCK_ITEM =
  "relative flex min-w-[62px] flex-1 flex-col items-center justify-center px-1 py-1.5";

function DockTile({
  icon: Icon,
  short,
  active,
}: {
  icon: LucideIcon;
  short: string;
  active?: boolean;
}) {
  return (
    <span
      className={`flex min-h-[44px] w-full flex-col items-center justify-center gap-1 rounded-[14px] transition-colors ${
        active ? "bg-[var(--acc)] text-[var(--acc-ink)]" : "text-[var(--nav)]"
      }`}
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.3 : 2} />
      <span className="font-mono text-[8.5px] tracking-[0.04em]">{short}</span>
    </span>
  );
}

// Replie / déplie la sidebar en rail d'icônes. L'état est porté par
// data-sidebar sur <html> (posé sans flash par le script inline de layout.tsx),
// et l'apparence est pilotée par CSS (globals.css) → pas de flash à l'hydratation.
function toggleSidebar() {
  const root = document.documentElement;
  const collapsed = root.dataset.sidebar === "collapsed";
  if (collapsed) delete root.dataset.sidebar;
  else root.dataset.sidebar = "collapsed";
  try {
    localStorage.setItem("myflip-sidebar", collapsed ? "expanded" : "collapsed");
  } catch {
    /* stockage indisponible : on ignore */
  }
}

export default function Sidebar() {
  const pathname = usePathname();
  // Lu depuis les notifications, pas depuis la liste des articles : l'ancienne
  // version téléchargeait TOUS les articles à comptabiliser, sur chaque page,
  // pour n'en lire que la longueur.
  const count = useCompteAComptabiliser();

  // Indicateur actif unique qui glisse jusqu'à l'item courant (#07). On mesure
  // la position/hauteur de l'item actif ; le repli (rail) ne change pas ces
  // métriques verticales, donc l'indicateur reste juste.
  const navRef = useRef<HTMLElement>(null);
  const [indicator, setIndicator] = useState<{ top: number; height: number } | null>(
    null,
  );
  useLayoutEffect(() => {
    const active = navRef.current?.querySelector<HTMLElement>(
      '[data-active="true"]',
    );
    if (active) setIndicator({ top: active.offsetTop, height: active.offsetHeight });
  }, [pathname]);

  return (
    <>
      {/* Sidebar verticale fixe (desktop), repliable en rail d'icônes */}
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-[var(--sidebar-w)] flex-col border-r border-[var(--border)] bg-surface px-3 pb-[18px] pt-[14px] transition-[width] duration-200 ease-out md:flex">
        {/* Bouton de repli, posé sur la bordure droite */}
        <button
          onClick={toggleSidebar}
          aria-label="Réduire ou agrandir le menu"
          title="Réduire / agrandir le menu"
          className="absolute -right-3.5 top-1/2 z-50 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--border)] bg-surface text-[var(--nav)] shadow-[0_2px_10px_rgba(20,53,40,.14)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--acc)]"
        >
          <PanelLeft className="h-[15px] w-[15px]" strokeWidth={2} />
        </button>

        {/* Tuile d'accent + wordmark texte, comme la maquette.
            Les SVG de `public/logo-atlas/` ne sont plus utilisés ici : ils
            embarquent l'ancien vert #1B4332 en dur, qui jure avec le nouvel
            accent et devient illisible sur le fond graphite du thème sombre.
            Ils restent en place pour le favicon et l'icône iOS. */}
        <div className="mb-3.5 flex items-center gap-2.5 px-1 pb-1">
          <span
            aria-hidden="true"
            className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[13px] bg-[var(--acc)] text-[16px] font-bold text-[var(--acc-ink)]"
          >
            M
          </span>
          <span className="sb-hide-collapsed min-w-0 flex-1">
            <span className="block text-[15px] font-bold tracking-[-0.02em] text-[var(--ink)]">
              MyFlip
            </span>
            <span className="block font-mono text-[9px] tracking-[0.14em] text-[var(--faint)]">
              CONSOLE REVENTE
            </span>
          </span>
        </div>

        <nav ref={navRef} className="relative flex flex-col gap-[3px] overflow-y-auto">
          {/* Indicateur actif qui glisse (spring léger) — derrière les items */}
          {indicator && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 z-0 rounded-[15px] bg-[var(--acc)] transition-[top,height] duration-300 ease-[cubic-bezier(.34,1.4,.5,1)]"
              style={{ top: indicator.top, height: indicator.height }}
            />
          )}
          {NAV.map((item, index) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Fragment key={item.href}>
                {index === PREMIER_SECONDAIRE && (
                  <div
                    role="separator"
                    className="relative z-10 mx-3 my-1.5 border-t border-[var(--border)]"
                  />
                )}
                <Link
                  href={item.href}
                  title={item.label}
                  data-active={active}
                  className={`sb-item relative z-10 flex min-h-[46px] items-center gap-[11px] rounded-[15px] px-3 transition-colors ${
                    active
                      ? "font-bold text-[var(--acc-ink)]"
                      : "font-medium text-[var(--nav)] hover:bg-[var(--tint)] hover:text-[var(--ink)]"
                  }`}
                >
                  <Icon
                    className="h-[18px] w-[18px] flex-shrink-0"
                    strokeWidth={active ? 2.3 : 2}
                  />
                  <ItemLabel label={item.label} short={item.short} />
                  {item.badge && count > 0 && (
                    <>
                      {/* Déployée : la même pastille que le dock mobile, pour que
                          le compteur se lise comme une notification et non comme
                          une décoration. Le liseré en --surface la détache du
                          fond d'accent de la ligne active, qui est lime en thème
                          sombre — sans lui, le contraste tombe à ~2,3:1. */}
                      <span
                        aria-label={`${count} article${count > 1 ? "s" : ""} à comptabiliser`}
                        className="sb-hide-collapsed inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--alert)] px-1.5 font-mono text-[10px] font-bold text-white ring-2 ring-[var(--surface)]"
                      >
                        {count}
                      </span>
                      <span className="sb-only-collapsed absolute right-2 top-1.5 h-[6px] w-[6px] rounded-full bg-[var(--alert)]" />
                    </>
                  )}
                </Link>
              </Fragment>
            );
          })}

        </nav>

        {/* Bas de sidebar : déconnexion + liens légaux */}
        <div className="mt-auto pt-3">
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            title="Déconnexion"
            className="sb-item flex min-h-[46px] w-full items-center gap-[11px] rounded-[15px] px-3 font-medium text-[var(--nav)] transition-colors hover:bg-[var(--tint)] hover:text-[var(--ink)]"
          >
            <LogOut className="h-[18px] w-[18px] flex-shrink-0" strokeWidth={2} />
            <ItemLabel label="Déconnexion" short="SORTIR" />
          </button>
          <div className="sb-hide-collapsed mt-2 border-t border-[var(--border)] px-3 pt-3">
            <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[9.5px] tracking-[0.06em] text-[var(--faint)]">
              <a href="/legal/mentions-legales" className="hover:text-[var(--ink2)]">
                MENTIONS
              </a>
              <a href="/legal/cgu" className="hover:text-[var(--ink2)]">
                CGU
              </a>
              <a href="/legal/confidentialite" className="hover:text-[var(--ink2)]">
                CONFIDENTIALITÉ
              </a>
            </div>
            <p className="mt-1.5 font-mono text-[9px] tracking-[0.06em] text-[var(--faint)] opacity-70">
              © 2026 MYFLIP
            </p>
          </div>
        </div>
      </aside>

      {/* Bottom navigation (mobile) — défilable horizontalement */}
      <nav
        className="fixed bottom-0 left-0 z-40 flex w-full items-stretch overflow-x-auto border-t border-[var(--border)] bg-surface md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {NAV_DOCK.map((item) => (
          <Link key={item.href} href={item.href} className={DOCK_ITEM}>
            <DockTile
              icon={item.icon}
              short={item.short}
              active={isActive(pathname, item.href)}
            />
            {item.badge && count > 0 && (
              <span className="absolute right-1.5 top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--alert)] px-1 font-mono text-[9px] font-bold text-white">
                {count}
              </span>
            )}
          </Link>
        ))}
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className={DOCK_ITEM}
        >
          <DockTile icon={LogOut} short="SORTIR" />
        </button>
      </nav>
    </>
  );
}
