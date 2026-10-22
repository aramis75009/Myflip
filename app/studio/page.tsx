import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { chargerGrille } from "@/lib/studioServeur";
import Accueil from "./_components/Accueil";

export const dynamic = "force-dynamic";

// /studio — tous les coloris du catalogue SacBase, filtrables par génération.
export default async function StudioPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const donnees = await chargerGrille(userId);
  return <Accueil donnees={donnees} />;
}
