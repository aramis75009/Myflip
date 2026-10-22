"use client";

import "./tokens.css";
import "./globals.css";

import { buttonVariants } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";
import { SCRIPT_THEME } from "@/lib/themeMeta";

/**
 * The root layout itself crashed: this replaces it, so it brings its own
 * <html>, <body>, styles and theme script. No frame, no provider.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_THEME }} />
        <main className="flex min-h-dvh flex-col items-center justify-center px-5 text-center">
          <ErrorState
            titre="Cette page n'a pas pu s'afficher"
            description="Réessaie ; si ça recommence, recharge la page."
            detail={error.digest ? `Référence : ${error.digest}` : undefined}
            onRetry={reset}
          />
          <a href="/dashboard" className={buttonVariants({ variant: "ghost" })}>
            Aller au tableau de bord
          </a>
        </main>
      </body>
    </html>
  );
}
