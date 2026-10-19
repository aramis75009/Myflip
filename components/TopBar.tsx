"use client";

import { usePathname } from "next/navigation";
import NotificationBell from "./NotificationBell";
import ThemeToggle from "./ThemeToggle";
import AccountMenu from "./AccountMenu";

// Libellé + sous-titre par route. Le sous-titre est le « kicker » mono de la
// maquette Direction C : il dit ce que l'écran contient, en capitales
// espacées, et n'est affiché qu'en desktop (la maquette le masque en mobile
// pour garder la barre sur une seule ligne).
const LABELS: Record<string, { title: string; sub: string }> = {
  "/dashboard": { title: "Dashboard", sub: "VUE D'ENSEMBLE" },
  "/stock": { title: "Stock", sub: "INVENTAIRE COMPLET" },
  "/mise-en-vente": { title: "Mise en vente", sub: "ASSISTANT D'ANNONCES" },
  "/a-comptabiliser": { title: "À comptabiliser", sub: "VENTES EN ATTENTE" },
  "/calendrier": { title: "Calendrier", sub: "VENTES PAR MOIS" },
  "/commandes": { title: "Commandes", sub: "ACHATS EN LOT" },
  "/statistiques": { title: "Statistiques", sub: "PERFORMANCE" },
  "/parametres": { title: "Prompts", sub: "MODÈLES IA" },
  "/compte": { title: "Mon compte", sub: "PROFIL & SÉCURITÉ" },
  "/studio": { title: "Studio (test)", sub: "BANC DE TEST IA" },
};

// Barre supérieure partagée : nom de la page à gauche (unique source du titre —
// les pages ne le répètent plus dans leur contenu), cloche + thème + compte à
// droite. Rendue par AppShell en haut de la colonne de contenu.
export default function TopBar() {
  const pathname = usePathname();
  const entry =
    LABELS[pathname] ??
    Object.entries(LABELS).find(([p]) => pathname.startsWith(p))?.[1] ??
    { title: "MyFlip", sub: "CONSOLE REVENTE" };

  return (
    <div className="sticky top-0 z-40 flex h-[62px] flex-shrink-0 items-center justify-between gap-3 border-b border-line bg-[var(--bg)] pl-4 pr-3 backdrop-blur-md md:pl-[26px] md:pr-5">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[19px] font-bold tracking-[-0.02em] text-ink">
          {entry.title}
        </div>
        <div className="hidden truncate font-mono text-[10.5px] tracking-[0.06em] text-[var(--faint)] md:block">
          {entry.sub}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <NotificationBell />
        <ThemeToggle />
        <span className="mx-1 h-6 w-px bg-line" aria-hidden="true" />
        <AccountMenu />
      </div>
    </div>
  );
}
