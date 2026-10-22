import { useSyncExternalStore } from "react";
import {
  BarChart3,
  Calendar,
  FileText,
  FlaskConical,
  LayoutDashboard,
  Package,
  Settings,
  ShoppingBag,
  Tag,
  UserCircle,
  type LucideIcon,
} from "lucide-react";

/**
 * One destination of the frame. The same list feeds the side menu (desktop),
 * the dock and the « Plus » sheet (mobile), so a page is renamed in one place.
 */
export type EntreeNav = {
  href: string;
  libelle: string;
  icone: LucideIcon;
  /** Shows the « à comptabiliser » counter. */
  compteur?: boolean;
  /** Second group of the side menu, after the separator. */
  section?: "studio";
  /** In the mobile dock (see ORDRE_DOCK for the order). */
  dock?: boolean;
  /** In the mobile « Plus » sheet. */
  plus?: boolean;
  /** Desktop screen: flagged « sur ordinateur » on mobile. */
  ordinateur?: boolean;
  /** Shorter label for the dock (5 cells in 390 px). */
  libelleCourt?: string;
};

export const NAVIGATION: EntreeNav[] = [
  { href: "/dashboard", libelle: "Tableau de bord", libelleCourt: "Accueil", icone: LayoutDashboard, dock: true },
  { href: "/stock", libelle: "Stock", icone: Package, dock: true },
  { href: "/mise-en-vente", libelle: "Mise en vente", icone: Tag, plus: true, ordinateur: true },
  {
    href: "/a-comptabiliser",
    libelle: "À comptabiliser",
    libelleCourt: "À compta",
    icone: FileText,
    compteur: true,
    dock: true,
  },
  { href: "/calendrier", libelle: "Calendrier", icone: Calendar, plus: true },
  { href: "/commandes", libelle: "Commandes", icone: ShoppingBag, dock: true },
  { href: "/statistiques", libelle: "Statistiques", icone: BarChart3, plus: true },
  { href: "/parametres", libelle: "Réglages", icone: Settings, plus: true },
  { href: "/compte", libelle: "Mon compte", icone: UserCircle, plus: true },
  { href: "/studio", libelle: "Studio", icone: FlaskConical, section: "studio", plus: true, ordinateur: true },
];

/**
 * Dock order (mobile): not the menu order. « Commandes » stands where the
 * audit puts « Vendre » until Aramis says how to pick the article (plan § 5,
 * question 6).
 */
const ORDRE_DOCK = ["/dashboard", "/stock", "/commandes", "/a-comptabiliser"];

export const ENTREES_DOCK: EntreeNav[] = ORDRE_DOCK.map((href) => NAVIGATION.find((e) => e.href === href)).filter(
  (e): e is EntreeNav => e !== undefined && e.dock === true,
);

export const ENTREES_PLUS: EntreeNav[] = NAVIGATION.filter((e) => e.plus);

export const LIENS_LEGAUX = [
  { href: "/legal/mentions-legales", libelle: "Mentions légales" },
  { href: "/legal/cgu", libelle: "CGU" },
  { href: "/legal/confidentialite", libelle: "Confidentialité" },
] as const;

/** The link is the current page, or one of its sub-pages. */
export function estActif(chemin: string, href: string): boolean {
  return chemin === href || chemin.startsWith(`${href}/`);
}

// ---------- Collapsed side menu (rail) ----------
//
// The state lives on <html data-sidebar="collapsed">, set before the first
// paint by the inline script (lib/themeMeta.ts) and saved in localStorage.
// The look is pure CSS (`replie:` variant), so the server HTML is already
// right; only the ARIA state needs JavaScript.

const CLE_SIDEBAR = "myflip-sidebar";

function abonnerRepli(avertir: () => void): () => void {
  const obs = new MutationObserver(avertir);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-sidebar"] });
  return () => obs.disconnect();
}

const lireRepli = () => document.documentElement.dataset.sidebar === "collapsed";
const repliServeur = () => null;

/** `null` on the server and during hydration (unknown), then the real state. */
export function useMenuReplie(): boolean | null {
  return useSyncExternalStore<boolean | null>(abonnerRepli, lireRepli, repliServeur);
}

export function basculerMenu(): void {
  const racine = document.documentElement;
  const replie = racine.dataset.sidebar === "collapsed";
  if (replie) delete racine.dataset.sidebar;
  else racine.dataset.sidebar = "collapsed";
  try {
    localStorage.setItem(CLE_SIDEBAR, replie ? "expanded" : "collapsed");
  } catch {
    /* storage unavailable: the choice lasts for this page only */
  }
}
