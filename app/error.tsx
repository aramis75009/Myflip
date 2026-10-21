"use client";

import Link from "next/link";

import { Frame } from "@/components/console";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";

/** A page crashed while rendering: say so, offer to retry, keep the frame. */
export default function Erreur({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Frame className="items-center justify-center">
      <ErrorState
        titre="Cette page n'a pas pu s'afficher"
        description="Réessaie ; si ça recommence, recharge la page."
        detail={error.digest ? `Référence : ${error.digest}` : undefined}
        onRetry={reset}
      />
      <Button asChild variant="ghost">
        <Link href="/dashboard">Aller au tableau de bord</Link>
      </Button>
    </Frame>
  );
}
