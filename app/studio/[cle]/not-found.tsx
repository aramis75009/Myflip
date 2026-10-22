import Link from "next/link";

import { Frame } from "@/components/console";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";

/**
 * /studio/<unknown key>: a real 404 (no loading.tsx in this segment, so the
 * status is not sent before the page decides). The Studio banner and
 * sub-navigation (layout) stay around it.
 */
export default function ColorisIntrouvable() {
  return (
    <Frame className="items-center justify-center">
      <h1 className="sr-only">Coloris introuvable</h1>
      <EmptyState
        titre="Ce coloris n’existe pas (ou plus) dans SacBase."
        description="La clé de l’adresse ne correspond à aucun coloris du catalogue ni de tes essais."
        action={
          <Button asChild variant="secondary">
            <Link href="/studio">Tous les coloris</Link>
          </Button>
        }
      />
    </Frame>
  );
}
