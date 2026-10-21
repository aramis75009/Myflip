"use client";

import { usePathname } from "next/navigation";

import AccountMenu from "./AccountMenu";
import { estActif } from "./cadre/navigation";
import NotificationBell from "./NotificationBell";
import ThemeToggle from "./ThemeToggle";

// Page title + kicker per route. The kicker says what the screen holds and
// is shown on desktop only (the bar keeps a single line on mobile). Exact
// routes are matched first, so « /studio/bilan » wins over « /studio ».
const LABELS: Record<string, { title: string; sub?: string }> = {
  "/dashboard": { title: "Tableau de bord", sub: "VUE D'ENSEMBLE" },
  "/stock": { title: "Stock", sub: "INVENTAIRE COMPLET" },
  "/mise-en-vente": { title: "Mise en vente", sub: "ASSISTANT D'ANNONCES" },
  "/a-comptabiliser": { title: "À comptabiliser", sub: "VENTES EN ATTENTE" },
  "/calendrier": { title: "Calendrier", sub: "VENTES PAR MOIS" },
  "/commandes": { title: "Commandes", sub: "ACHATS EN LOT" },
  "/statistiques": { title: "Statistiques", sub: "PERFORMANCE" },
  "/parametres": { title: "Réglages", sub: "MODÈLES IA" },
  "/compte": { title: "Mon compte", sub: "PROFIL & SÉCURITÉ" },
  "/demarrage": { title: "Démarrage" },
  "/studio/bilan": { title: "Studio — Bilan", sub: "PHOTOS D’ANGLE IA" },
  "/studio": { title: "Studio", sub: "PHOTOS D’ANGLE IA" },
};

const INCONNUE = { title: "MyFlip", sub: "CONSOLE REVENTE" };

/**
 * Shared top bar: the page title (the only <h1> of a known route; an
 * unknown route — the 404 — carries its own), then bell, theme and account.
 */
export default function TopBar() {
  const pathname = usePathname();
  const connue = LABELS[pathname] ?? Object.entries(LABELS).find(([p]) => estActif(pathname, p))?.[1];
  const entry = connue ?? INCONNUE;
  const Titre = connue ? "h1" : "p";

  return (
    <header className="sticky top-0 z-sticky flex h-[var(--topbar-h)] flex-shrink-0 items-center justify-between gap-3 border-b border-line bg-bg/90 pl-4 pr-3 backdrop-blur md:pl-[26px] md:pr-5">
      <div className="min-w-0 flex-1">
        <Titre className="truncate text-lg font-bold tracking-[-0.02em] text-ink">{entry.title}</Titre>
        {entry.sub && (
          <p className="hidden truncate font-mono text-xs tracking-[0.06em] text-ink-3 md:block">{entry.sub}</p>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <NotificationBell />
        <ThemeToggle />
        <span className="mx-1 h-6 w-px bg-line" aria-hidden="true" />
        <AccountMenu />
      </div>
    </header>
  );
}
