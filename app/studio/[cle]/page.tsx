import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { chargerFiche } from "@/lib/studioServeur";
import FicheColoris from "../_components/FicheColoris";

export const dynamic = "force-dynamic";

// /studio/[cle] — la fiche d'un coloris : références, détails, une ligne par angle.
export default async function FicheColorisPage({ params }: { params: Promise<{ cle: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const { cle } = await params;
  const fiche = await chargerFiche(userId, decodeURIComponent(cle));
  if (!fiche) notFound();

  // Dates en chaînes : la fiche passe la frontière serveur → client.
  return (
    <FicheColoris
      fiche={{
        ...fiche,
        references: fiche.references.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
        essais: fiche.essais.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
      }}
    />
  );
}
