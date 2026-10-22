"use client";

import { Frame } from "@/components/console";
import { ErrorState } from "@/components/ui/states";

/** A Studio page crashed: the banner and sub-navigation (layout) stay. */
export default function ErreurStudio({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Frame className="items-center justify-center">
      <ErrorState
        titre="Le Studio n'a pas pu se charger."
        detail={error.digest ? `Référence : ${error.digest}` : undefined}
        onRetry={reset}
      />
    </Frame>
  );
}
