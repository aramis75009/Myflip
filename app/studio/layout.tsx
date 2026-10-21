// design-tokens-dette: R14 → L2a
import type { ReactNode } from "react";
import Link from "next/link";
import { FlaskConical } from "lucide-react";

// Studio — variantes d'angle des photos de sacs. Desktop uniquement (spec §2,
// §10) : les règles mobile de CLAUDE.md ne s'appliquent pas à ces écrans.
//
// Le bandeau est posé ICI, dans le layout, pour qu'aucune page /studio ne
// puisse l'oublier (spec §7 : bandeau permanent). Depuis le 20/10, une image
// validée rejoint l'annonce de son sac : le bandeau le dit.

export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <div
        role="note"
        className="flex items-center gap-2.5 border-b border-warn bg-warn-soft px-[18px] py-2 text-sm font-semibold text-ink"
      >
        <FlaskConical size={15} className="flex-none text-warn" aria-hidden="true" />
        <span>Images générées par IA : seules celles que tu valides partent dans l’annonce du sac</span>
        <nav className="ml-auto flex gap-4 font-mono text-xs tracking-[0.06em] text-ink-2">
          <Link href="/studio" className="hover:text-ink">COLORIS</Link>
          <Link href="/studio/bilan" className="hover:text-ink">BILAN</Link>
        </nav>
      </div>
      {children}
    </div>
  );
}
