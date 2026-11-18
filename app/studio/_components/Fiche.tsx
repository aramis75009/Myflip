"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Frame } from "@/components/console";
import { useMouvementReduit } from "@/lib/useMouvementReduit";
import type { DonneesFiche } from "@/lib/studioServeur";
import { fusionnerVersions, prochainNumero, type VersionEnBase } from "@/lib/studioVersion";

import { BandeauSacbase } from "../_ui";
import { EnTete } from "./EnTeteFiche";
import Planche from "./Planche";
import { idSection, type Section } from "./SectionEtape";
import Versions from "./Versions";

export type FicheClient = DonneesFiche;

/**
 * /studio/[cle] — the sheet of a colourway: its identity and bags, the board of
 * real photos (batch retouch), then the versions of the bag. AI image
 * generation was removed on 17/11/2026 (PRD 2026-11-16, step 6).
 */
export default function Fiche({ fiche }: { fiche: FicheClient }) {
  const reduit = useMouvementReduit();
  const router = useRouter();
  const { coloris } = fiche;
  const [cible, setCible] = useState<string | null>(fiche.cibles[0] ?? null);
  const cibleValide = cible && fiche.cibles.includes(cible) ? cible : fiche.cibles[0] ?? null;

  const [plancheOuverte, setPlancheOuverte] = useState(true);

  // Versions of the bag (17/11): those of the server, plus one just created and not read again yet.
  const [versions, setVersions] = useState<VersionEnBase[]>(fiche.versions);
  useEffect(() => setVersions((locales) => fusionnerVersions(locales, fiche.versions)), [fiche.versions]);
  const [versionChoisie, setVersionChoisie] = useState(1);
  const [versionsOuverte, setVersionsOuverte] = useState(false);
  // Version 1 = the current listing of the bag shown in the header (the target bag, or the first bag of the colourway).
  const skuVersionUn = cibleValide ?? fiche.sacs[0]?.sku ?? null;
  const versionUn = fiche.versionsUn.find((v) => v.sku === skuVersionUn) ?? null;

  const [aFaireDefiler, setAFaireDefiler] = useState<Section | null>(null);
  useEffect(() => {
    if (!aFaireDefiler) return;
    const el = document.getElementById(idSection(aFaireDefiler));
    el?.scrollIntoView({ behavior: reduit ? "auto" : "smooth", block: "start" });
    el?.querySelector<HTMLButtonElement>("h2 button")?.focus({ preventScroll: true });
    setAFaireDefiler(null);
  }, [aFaireDefiler, reduit]);

  return (
    <Frame>
      <BandeauSacbase etat={fiche.sacbase} />

      <EnTete fiche={fiche} cible={cibleValide} onCible={setCible} />

      <Planche
        ouverte={plancheOuverte}
        onBasculer={() => setPlancheOuverte((o) => !o)}
        cle={coloris.cle}
        generation={fiche.generation}
        lignes={fiche.lignes}
        copies={fiche.copies}
        servies={new Set(fiche.servies)}
        enVersion={new Set(fiche.photosEnVersion)}
        skuSource={skuVersionUn}
        numeroSuivant={prochainNumero(versions.map((v) => v.numero))}
        onVersionCreee={(v) => {
          setVersions((actuelles) => fusionnerVersions(actuelles, [v]));
          setVersionChoisie(v.numero);
          setVersionsOuverte(true);
          setAFaireDefiler("versions");
          router.refresh();
        }}
      />
      <Versions
        ouverte={versionsOuverte}
        onBasculer={() => setVersionsOuverte((o) => !o)}
        cle={coloris.cle}
        versionUn={versionUn}
        versions={versions}
        choisie={versionChoisie}
        onChoisir={setVersionChoisie}
        onVersionModifiee={(v) => setVersions((actuelles) => actuelles.map((x) => (x.id === v.id ? v : x)))}
      />
    </Frame>
  );
}
