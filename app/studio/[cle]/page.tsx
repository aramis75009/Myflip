import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { chargerFiche } from "@/lib/studioServeur";
import Fiche from "../_components/Fiche";

export const dynamic = "force-dynamic";

// /studio/[cle] — la fiche d'un coloris : images à juger, puis le tableau
// vraie photo × prompt d'angle pour préparer le prochain sac.
export default async function FicheColorisPage({ params }: { params: Promise<{ cle: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const { cle } = await params;
  const fiche = await chargerFiche(userId, decodeURIComponent(cle));
  if (!fiche) notFound();

  // Dates en chaînes : la fiche passe la frontière serveur → client.
  return <Fiche fiche={{ ...fiche, essais: fiche.essais.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })) }} />;
}
