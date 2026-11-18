import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Hammer, Monitor } from "lucide-react";

// Studio — real photos of the bags, retouched in batches into versions of a
// listing (PRD 2026-11-16). Desktop only (spec §2, §10): the mobile rules of
// CLAUDE.md do not apply to these screens. Under 768 px a message says so
// (audit question 11: message AND no overflow); the pages stay readable for a
// quick look.
//
// AI image generation, its banner and the Studio sub-navigation (Bilan,
// Réglages) were removed on 17/11/2026 (PRD step 6). The « en chantier »
// banner stays until Aramis says otherwise (PRD § 11).

export const metadata: Metadata = { title: "Studio" };

export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div
        role="note"
        className="flex items-center gap-2.5 border-b border-warn bg-warn-soft px-[18px] py-2 text-sm font-semibold text-ink"
      >
        <Hammer size={15} className="flex-none text-warn" aria-hidden="true" />
        <span>Studio en chantier : il ne fonctionne pas encore correctement, ne t’y fie pas pour l’instant.</span>
      </div>
      <p className="flex items-start gap-2.5 border-b border-line bg-surface-2 px-4 py-3 text-base text-ink md:hidden">
        <Monitor size={18} className="mt-0.5 flex-none text-ink-2" aria-hidden="true" />
        <span>
          <strong className="font-semibold">Le Studio s’utilise sur ordinateur.</strong> Sur téléphone, tu peux consulter, mais ranger
          et retoucher les photos demandent un grand écran.
        </span>
      </p>
      {children}
    </div>
  );
}
