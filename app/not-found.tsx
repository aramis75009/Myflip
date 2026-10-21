import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page introuvable" };

/**
 * 404, inside the frame when signed in. Centred in the flow (the frame
 * column has the only full height). It carries its own <h1>: the top bar
 * does not know this route.
 */
export default function NotFound() {
  return (
    <main id="contenu" tabIndex={-1} className="flex flex-1 flex-col items-center justify-center px-5 py-16 text-center">
      <p aria-hidden="true" className="font-sans text-3xl font-bold text-accent-text">
        404
      </p>
      <h1 className="mt-4 text-xl font-bold text-ink">Page introuvable</h1>
      <p className="mt-2 text-md text-ink-2">Cette page n&apos;existe pas.</p>
      <Button asChild size="lg" className="mt-8">
        <Link href="/dashboard">Aller au tableau de bord</Link>
      </Button>
    </main>
  );
}
