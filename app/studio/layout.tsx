import type { Metadata } from "next";
import type { ReactNode } from "react";
import { FlaskConical, Monitor } from "lucide-react";

import SousNavStudio from "@/components/cadre/SousNavStudio";

// Studio — angle variants of bag photos. Desktop only (spec §2, §10): the
// mobile rules of CLAUDE.md do not apply to these screens. Under 768 px a
// message says so (audit question 11: message AND no overflow); the pages
// stay readable for a quick look.
//
// The banner lives HERE, in the layout, so that no /studio page can forget it
// (spec §7: permanent banner). Since 20/10 a validated image joins the
// listing of its bag: the banner says so.

export const metadata: Metadata = { title: "Studio" };

export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div
        role="note"
        className="flex items-center gap-2.5 border-b border-warn bg-warn-soft px-[18px] py-2 text-sm font-semibold text-ink"
      >
        <FlaskConical size={15} className="flex-none text-warn" aria-hidden="true" />
        <span>Images générées par IA : seules celles que tu valides partent dans l’annonce du sac</span>
      </div>
      <p className="flex items-start gap-2.5 border-b border-line bg-surface-2 px-4 py-3 text-base text-ink md:hidden">
        <Monitor size={18} className="mt-0.5 flex-none text-ink-2" aria-hidden="true" />
        <span>
          <strong className="font-semibold">Le Studio s’utilise sur ordinateur.</strong> Sur téléphone, tu peux consulter, mais ranger,
          générer et juger demandent un grand écran.
        </span>
      </p>
      <SousNavStudio />
      {children}
    </div>
  );
}
