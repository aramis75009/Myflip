"use client";

import { useEffect, useState } from "react";

import { Frame } from "@/components/console";
import { useMouvementReduit } from "@/lib/useMouvementReduit";
import { MODELE_MANUEL } from "@/lib/studioFiche";
import type { DonneesFiche } from "@/lib/studioServeur";

import { ETAPES, prochaineAction, type Etape } from "../_parcours";
import { BandeauSacbase } from "../_ui";
import ApercuPrompt from "./ApercuPrompt";
import { CarteProchaineAction, EnTete } from "./EnTeteFiche";
import FileAJuger from "./FileAJuger";
import Generation from "./Generation";
import Planche from "./Planche";
import { idEtape } from "./SectionEtape";
import TableauAngles from "./TableauAngles";
import { useModeles } from "./useModeles";
import { useAvisIA, useChoixCases, useDecisions } from "./useParcours";
import Validees from "./Validees";

type AvecDate<T> = Omit<T, "createdAt"> & { createdAt: string };
export type FicheClient = Omit<DonneesFiche, "essais"> & { essais: AvecDate<DonneesFiche["essais"][number]>[] };
export type EssaiClient = FicheClient["essais"][number];

/**
 * /studio/[cle] — the sheet opens on the NEXT ACTION, then the five steps in
 * work order (photos → angles → generation → judging → validated). The step
 * holding the next action is unfolded; the others show their state in one line.
 */
export default function Fiche({ fiche }: { fiche: FicheClient }) {
  const reduit = useMouvementReduit();
  const modeles = useModeles();
  const { coloris } = fiche;
  const [cible, setCible] = useState<string | null>(fiche.cibles[0] ?? null);
  const cibleValide = cible && fiche.cibles.includes(cible) ? cible : fiche.cibles[0] ?? null;
  const choix = useChoixCases(fiche, cibleValide);
  const avis = useAvisIA();
  const [courantId, setCourantId] = useState<string | null>(null);
  const [apercu, setApercu] = useState<{ ouvert: boolean; angleId: string | null }>({ ouvert: false, angleId: null });

  const parId = new Map((modeles.catalogue?.modeles ?? []).map((m) => [m.id, m]));
  const nomDe = (id: string) => (id === MODELE_MANUEL ? "Dépôt manuel (Gemini)" : parId.get(id)?.nom ?? id);

  const decisions = useDecisions(fiche, (id) => {
    setCourantId(id);
    setOuvertes((o) => new Set(o).add("a-juger"));
  });

  const file = fiche.essais
    .filter((e) => e.decision === null && !e.purge && !decisions.masquees.has(e.id))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const action = prochaineAction({
    photos: fiche.lignes.length,
    angles: fiche.angles.length,
    aJuger: file.length,
    cible: cibleValide,
    choisies: choix.choisies.length,
    sansImage: choix.sansImage,
    validees: choix.pretes,
  });

  // The step of the next action is unfolded at opening; later changes of the
  // next action do not fold anything (no layout jump while working).
  const [ouvertes, setOuvertes] = useState<ReadonlySet<Etape>>(() => new Set([action.etape]));
  const basculer = (e: Etape) =>
    setOuvertes((o) => {
      const n = new Set(o);
      if (n.has(e)) n.delete(e);
      else n.add(e);
      return n;
    });

  const [aFaireDefiler, setAFaireDefiler] = useState<Etape | null>(null);
  useEffect(() => {
    if (!aFaireDefiler) return;
    const el = document.getElementById(idEtape(aFaireDefiler));
    el?.scrollIntoView({ behavior: reduit ? "auto" : "smooth", block: "start" });
    el?.querySelector<HTMLButtonElement>("h2 button")?.focus({ preventScroll: true });
    setAFaireDefiler(null);
  }, [aFaireDefiler, reduit]);
  const ouvrir = (e: Etape) => {
    setOuvertes((o) => new Set(o).add(e));
    setAFaireDefiler(e);
  };

  const validees = fiche.essais.filter((e) => (decisions.decisionDe(e.id) ?? e.decision) === "valide").length;
  const resumes: Record<Etape, string> = {
    photos: `${fiche.lignes.length} / 15`,
    angles: cibleValide ? `${choix.choisies.length} choisies` : "—",
    generation: cibleValide ? `pour ${cibleValide}` : "aucun sac",
    "a-juger": String(file.length),
    validees: String(validees),
  };

  const props = (e: Etape) => ({
    numero: ETAPES.indexOf(e) + 1,
    ouverte: ouvertes.has(e),
    courante: action.etape === e,
    onBasculer: () => basculer(e),
  });

  return (
    <Frame>
      <BandeauSacbase etat={fiche.sacbase} />

      <EnTete
        fiche={fiche}
        cible={cibleValide}
        onCible={setCible}
        onApercu={() => setApercu({ ouvert: true, angleId: null })}
      />

      <CarteProchaineAction action={action} resumes={resumes} onOuvrir={ouvrir} />

      <Planche
        {...props("photos")}
        cle={coloris.cle}
        generation={fiche.generation}
        lignes={fiche.lignes}
        servies={new Set(fiche.essais.map((e) => e.referenceId))}
      />
      <TableauAngles
        {...props("angles")}
        fiche={fiche}
        cible={cibleValide}
        choix={choix}
        onApercu={(angleId) => setApercu({ ouvert: true, angleId })}
      />
      <Generation
        {...props("generation")}
        fiche={fiche}
        cible={cibleValide}
        choix={choix}
        modeles={modeles}
        onNouveaux={(ids) => avis.demander(ids)}
        onVoirAngles={() => ouvrir("angles")}
      />
      <FileAJuger
        {...props("a-juger")}
        fiche={fiche}
        file={file}
        courantId={courantId}
        onCourant={setCourantId}
        nomDe={nomDe}
        catalogue={parId}
        avis={avis}
        decisions={decisions}
      />
      <Validees {...props("validees")} fiche={fiche} cible={cibleValide} decisions={decisions} nomDe={nomDe} />

      <ApercuPrompt
        open={apercu.ouvert}
        onOpenChange={(ouvert) => setApercu((a) => ({ ...a, ouvert }))}
        promptMaitre={fiche.promptMaitre}
        angles={fiche.angles}
        angleInitial={apercu.angleId}
      />
    </Frame>
  );
}
