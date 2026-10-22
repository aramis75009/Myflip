import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { chargerGrille } from "@/lib/studioServeur";
import { lireFiltres } from "./_parcours";
import Accueil from "./_components/Accueil";

export const dynamic = "force-dynamic";

// /studio — tous les coloris du catalogue SacBase, rangés par prochaine action.
// Les filtres viennent de l'URL (?generation=V2&filtre=a_juger&q=…).
export default async function StudioPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const params = await searchParams;
  const premier = (nom: string) => {
    const v = params[nom];
    return typeof v === "string" ? v : Array.isArray(v) ? v[0] ?? null : null;
  };
  const donnees = await chargerGrille(userId);
  return <Accueil donnees={donnees} filtresInitiaux={lireFiltres({ get: premier })} />;
}
