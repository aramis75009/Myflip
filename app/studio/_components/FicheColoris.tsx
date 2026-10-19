"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";
import { CardTitle, Eyebrow, Frame, Module } from "@/components/console";
import { detailsEnLignes } from "@/lib/studioAngles";
import type { ModeleImage } from "@/lib/studioModeles";
import type { DonneesFiche } from "@/lib/studioServeur";
import { Badge, BandeauSacbase, btn, champ } from "../_ui";
import { lireErreur } from "./envoi";
import LigneAngle from "./LigneAngle";
import References from "./References";
import { SEUIL_TEXTE, type CatalogueClient, type ContexteModeles } from "./SelecteurModeles";

type AvecDate<T> = Omit<T, "createdAt"> & { createdAt: string };
export type FicheClient = Omit<DonneesFiche, "references" | "essais"> & {
  references: AvecDate<DonneesFiche["references"][number]>[];
  essais: AvecDate<DonneesFiche["essais"][number]>[];
};
export type RefClient = FicheClient["references"][number];
export type EssaiClient = FicheClient["essais"][number];
export type AngleClient = FicheClient["angles"][number];

/** GET /api/studio/modeles, lu défensivement : la route est la seule source du catalogue. */
type ReponseModeles = { modeles?: unknown; favoris?: unknown; etat?: CatalogueClient["etat"]; fetchedAt?: unknown };

/**
 * Catalogue des modèles d'image et favoris : chargés UNE fois pour la fiche,
 * partagés par toutes les lignes d'angle (une étoile posée sur un angle vaut
 * pour tous).
 */
function useModeles(): ContexteModeles {
  const [catalogue, setCatalogue] = useState<CatalogueClient | null>(null);
  const [favoris, setFavoris] = useState<string[]>([]);
  const [favorisEnCours, setFavorisEnCours] = useState<string[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async (signal?: AbortSignal) => {
    setChargement(true);
    setErreur(null);
    try {
      const res = await fetch("/api/studio/modeles", { signal, cache: "no-store" });
      if (!res.ok) throw new Error(await lireErreur(res));
      const j = (await res.json()) as ReponseModeles;
      if (!Array.isArray(j.modeles)) throw new Error("réponse illisible");
      setCatalogue({
        modeles: j.modeles as ModeleImage[],
        etat: j.etat ?? { kind: "live" },
        fetchedAt: typeof j.fetchedAt === "string" ? j.fetchedAt : null,
      });
      setFavoris(Array.isArray(j.favoris) ? j.favoris.filter((x): x is string => typeof x === "string") : []);
    } catch (e) {
      if (signal?.aborted) return;
      setErreur(e instanceof Error ? e.message : "erreur inconnue");
    } finally {
      if (!signal?.aborted) setChargement(false);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    void charger(ctrl.signal);
    return () => ctrl.abort();
  }, [charger]);

  async function basculerFavori(id: string) {
    if (favorisEnCours.includes(id)) return;
    const ajout = !favoris.includes(id);
    setFavoris((f) => (ajout ? [...f, id] : f.filter((x) => x !== id)));
    setFavorisEnCours((f) => [...f, id]);
    try {
      const res = await fetch("/api/studio/modeles/favoris", {
        method: ajout ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modele: id }),
      });
      if (!res.ok) throw new Error(await lireErreur(res));
    } catch (e) {
      // Retour à l'état d'avant : l'étoile ne ment pas sur ce qui est en base.
      setFavoris((f) => (ajout ? f.filter((x) => x !== id) : [...f, id]));
      toast.error(`Favori non enregistré : ${e instanceof Error ? e.message : "erreur inconnue"}`);
    } finally {
      setFavorisEnCours((f) => f.filter((x) => x !== id));
    }
  }

  return {
    catalogue,
    chargement,
    erreur,
    recharger: () => void charger(),
    favoris,
    favorisEnCours,
    basculerFavori: (id) => void basculerFavori(id),
  };
}

export default function FicheColoris({ fiche }: { fiche: FicheClient }) {
  const router = useRouter();
  const modeles = useModeles();
  const { coloris } = fiche;
  const [details, setDetails] = useState(coloris.details);
  const [enregistre, setEnregistre] = useState(coloris.details);
  const [sauvegarde, setSauvegarde] = useState(false);
  const detailsModifies = details !== enregistre;

  async function enregistrerDetails() {
    if (!detailsModifies || sauvegarde) return;
    setSauvegarde(true);
    try {
      const res = await fetch(`/api/studio/coloris/${encodeURIComponent(coloris.cle)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ details }),
      });
      if (!res.ok) throw new Error(await lireErreur(res));
      setEnregistre(details);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setSauvegarde(false);
    }
  }

  const lignesDetails = detailsEnLignes(enregistre);

  return (
    <Frame>
      <BandeauSacbase etat={fiche.sacbase} />

      <Module>
        <div className="flex flex-wrap items-start gap-4">
          <Link href="/studio" className={btn} aria-label="Retour aux coloris">
            <ArrowLeft size={15} /> Coloris
          </Link>
          <div className="min-w-0">
            <Eyebrow>{coloris.modele || "MODÈLE ?"} · {coloris.cle}</Eyebrow>
            <h1 className="mt-1 text-[24px] font-bold tracking-[-0.02em]">{coloris.coloris || coloris.cle}</h1>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {fiche.catalogue ? (
              <>
                <Badge ton={fiche.catalogue.chezMoi >= 2 ? "acc" : "neutre"}>{fiche.catalogue.chezMoi} CHEZ MOI</Badge>
                {fiche.catalogue.sacs.map((s) => (
                  <Badge key={s.sku} ton={s.vendu ? "neutre" : "pos"} title={s.statut}>
                    {s.sku}
                  </Badge>
                ))}
              </>
            ) : (
              <Badge ton="warn">HORS CATALOGUE SACBASE</Badge>
            )}
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-1 text-[13px] text-[var(--ink2)]">
          <p>
            <strong className="text-[var(--ink)]">Par API</strong> : sur un angle, coche un ou plusieurs modèles OpenRouter, lis le
            devis, puis « Générer ». La clé OpenRouter de ton compte paie ; au-delà de {SEUIL_TEXTE}, ou si un tarif est
            inconnu, MyFlip demande confirmation.
          </p>
          <p>
            <strong className="text-[var(--ink)]">À la main</strong> : génère dans l’application Gemini, modèle <strong>Pro</strong>{" "}
            (pas Flash), format <strong>3:4</strong>, avec le prompt et les références de l’angle, puis dépose le résultat dans
            sa case.
          </p>
        </div>
      </Module>

      <References cle={coloris.cle} references={fiche.references} />

      <Module>
        <CardTitle aside={`${lignesDetails.length} DÉTAIL${lignesDetails.length > 1 ? "S" : ""}`}>Détails à préserver</CardTitle>
        <p className="mb-2 text-[13px] text-[var(--ink2)]">
          Un par ligne. Ils entrent dans chaque prompt ET dans la grille de vérification.
        </p>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          onBlur={enregistrerDetails}
          rows={4}
          placeholder={"patch ELITE côté gauche\nswoosh blanc cassé\nmotif camouflage bordeaux"}
          className={`${champ} font-mono text-[12.5px]`}
        />
        <div className="mt-2 flex items-center gap-3">
          <button type="button" className={btn} onClick={enregistrerDetails} disabled={!detailsModifies || sauvegarde}>
            <Save size={14} /> {sauvegarde ? "Enregistrement…" : "Enregistrer"}
          </button>
          {detailsModifies && (
            <span className="text-[12.5px] font-semibold text-[var(--warn)]">
              Non enregistré — les prompts et les dépôts utilisent la version enregistrée.
            </span>
          )}
        </div>
      </Module>

      <div className="flex flex-col gap-[14px]">
        {fiche.angles.map((a) => (
          <LigneAngle
            key={a.id}
            cle={coloris.cle}
            angle={a}
            details={enregistre}
            references={fiche.references}
            essais={fiche.essais.filter((e) => e.angleId === a.id)}
            depotBloque={detailsModifies}
            modeles={modeles}
          />
        ))}
      </div>
    </Frame>
  );
}
