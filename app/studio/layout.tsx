import type { ReactNode } from "react";
import Link from "next/link";
import { FlaskConical } from "lucide-react";

// Studio IA — banc de test. Desktop uniquement (spec §2, §10) : les règles
// mobile de CLAUDE.md ne s'appliquent pas à ces écrans.
//
// Le bandeau est posé ICI, dans le layout, pour qu'aucune page /studio ne
// puisse l'oublier (spec §7 : bandeau permanent).

export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)]">
      <div
        role="note"
        className="flex items-center gap-2.5 border-b border-[var(--warn)] bg-[var(--warn-soft)] px-[18px] py-2 text-[13px] font-semibold text-[var(--ink)]"
      >
        <FlaskConical size={15} className="flex-none text-[var(--warn)]" aria-hidden="true" />
        <span>Banc de test — images générées, hors mise en vente</span>
        <nav className="ml-auto flex gap-4 font-mono text-[11px] tracking-[0.06em] text-[var(--ink2)]">
          <Link href="/studio" className="hover:text-[var(--ink)]">COLORIS</Link>
          <Link href="/studio/bilan" className="hover:text-[var(--ink)]">BILAN</Link>
        </nav>
      </div>
      {children}
    </div>
  );
}
