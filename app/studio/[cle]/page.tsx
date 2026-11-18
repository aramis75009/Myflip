import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { cleStudio } from "@/lib/studioAlias";
import { chargerFiche } from "@/lib/studioServeur";
import Fiche from "../_components/Fiche";

export const dynamic = "force-dynamic";

// /studio/[cle] — la fiche d'un coloris : la planche des vraies photos
// (retouche par lot), puis les versions du sac.
export default async function FicheColorisPage({ params }: { params: Promise<{ cle: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const { cle: brute } = await params;
  const cle = decodeURIComponent(brute);
  // Alias du Studio (lib/studioAlias.ts) : /studio/5883-black-gold mène à la fiche 5880.
  const cible = cleStudio(cle);
  if (cible !== cle) redirect(`/studio/${encodeURIComponent(cible)}`);

  const fiche = await chargerFiche(userId, cle);
  if (!fiche) notFound();

  return <Fiche fiche={fiche} />;
}
