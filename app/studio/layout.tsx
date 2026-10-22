import type { Metadata } from "next";
import type { ReactNode } from "react";
import { FlaskConical } from "lucide-react";

import SousNavStudio from "@/components/cadre/SousNavStudio";

// Studio — angle variants of bag photos. Desktop only (spec §2, §10): the
// mobile rules of CLAUDE.md do not apply to these screens.
//
// The banner lives HERE, in the layout, so that no /studio page can forget it
// (spec §7: permanent banner). Since 20/10 a validated image joins the
// listing of its bag: the banner says so.

export const metadata: Metadata = { title: "Studio" };

export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <div
        role="note"
        className="flex items-center gap-2.5 border-b border-warn bg-warn-soft px-[18px] py-2 text-sm font-semibold text-ink"
      >
        <FlaskConical size={15} className="flex-none text-warn" aria-hidden="true" />
        <span>Images générées par IA : seules celles que tu valides partent dans l’annonce du sac</span>
      </div>
      <SousNavStudio />
      {children}
    </div>
  );
}
