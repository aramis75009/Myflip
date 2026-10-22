import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Frame } from "@/components/console";
import { SquelettePage } from "@/components/ui/states";
import { chargerGrille } from "@/lib/studioServeur";
import { lireFiltres } from "./_parcours";
import Accueil from "./_components/Accueil";

export const dynamic = "force-dynamic";

type Params = Promise<Record<string, string | string[] | undefined>>;

// /studio — tous les coloris du catalogue SacBase, rangés par prochaine action.
// Les filtres viennent de l'URL (?generation=V2&filtre=a_juger&q=…).
//
// Le squelette de chargement est ICI, dans la page, et non dans un
// app/studio/loading.tsx : celui-ci envelopperait aussi /studio/[cle], dont le
// statut HTTP partirait alors avec le squelette (200) avant que la fiche ne
// réponde notFound() pour une clé inconnue (404 attendu).
export default async function StudioPage({ searchParams }: { searchParams: Params }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  return (
    <Suspense
      fallback={
        <Frame>
          <SquelettePage />
        </Frame>
      }
    >
      <Catalogue userId={userId} searchParams={searchParams} />
    </Suspense>
  );
}

async function Catalogue({ userId, searchParams }: { userId: string; searchParams: Params }) {
  const params = await searchParams;
  const premier = (nom: string) => {
    const v = params[nom];
    return typeof v === "string" ? v : Array.isArray(v) ? v[0] ?? null : null;
  };
  const donnees = await chargerGrille(userId);
  return <Accueil donnees={donnees} filtresInitiaux={lireFiltres({ get: premier })} />;
}
