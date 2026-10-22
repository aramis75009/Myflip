"use client";

import { usePathname } from "next/navigation";

import Dock from "./cadre/Dock";
import MenuLateral from "./cadre/MenuLateral";
import ChatBot from "./ChatBot";
import TitreOnglet from "./TitreOnglet";
import TopBar from "./TopBar";

// Pages served without the app frame: no menu, no dock, no assistant. They
// are the public pages (landing, authentication, legal notices), reached
// without a session.
const SANS_CHASSIS = ["/", "/login", "/signup", "/reset-password"];

/**
 * The app frame: skip link, side menu (desktop), one column of a single
 * height (min-h-dvh, the page fills it with `Frame` = flex-1), dock and
 * assistant bubble (mobile).
 *
 * Bottom margin: the dock, the safe area and the bubble on mobile, the
 * bubble on desktop, plus the height of an open action bar (--fab-offset).
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (SANS_CHASSIS.includes(pathname) || pathname.startsWith("/legal")) {
    return <>{children}</>;
  }

  return (
    <>
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-skip focus:rounded focus:bg-surface focus:px-4 focus:py-2.5 focus:text-base focus:font-semibold focus:text-ink focus:shadow-over"
      >
        Aller au contenu
      </a>
      {/* Mounted here and no higher: it makes an authenticated request. */}
      <TitreOnglet />
      <MenuLateral />
      <div className="flex min-h-dvh flex-col pb-[calc(var(--dock-h)+env(safe-area-inset-bottom)+4.5rem+var(--fab-offset,0px))] transition-[padding] duration-base ease-out md:pb-[calc(5.5rem+var(--fab-offset,0px))] md:pl-[var(--sidebar-w)]">
        <TopBar />
        {children}
      </div>
      <Dock />
      <ChatBot />
    </>
  );
}
