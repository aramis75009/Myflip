"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronDown, Save } from "lucide-react";
import { toast } from "sonner";
import { Frame, Module } from "@/components/console";
import { detailsEnLignes } from "@/lib/studioAngles";
import { MODELE_MANUEL } from "@/lib/studioFiche";
import type { DonneesFiche } from "@/lib/studioServeur";
import { BandeauSacbase, btn, champ } from "../_ui";
import { lireErreur } from "./envoi";
import FileAJuger from "./FileAJuger";
import ImportPrises from "./ImportPrises";
import { demanderAvis } from "./lancer";
import TableauCases from "./TableauCases";
import { useModeles } from "./useModeles";

type AvecDate<T> = Omit<T, "createdAt"> & { createdAt: string };
export type FicheClient = Omit<DonneesFiche, "essais"> & { essais: AvecDate<DonneesFiche["essais"][number]>[] };
export type EssaiClient = FicheClient["essais"][number];

const STATUT_LIBELLE: Record<string, string> = {
  "En stock": "photos à préparer",
  "Photos prêtes": "photos prêtes",
  "En vente": "en vente",
  Vendu: "vendu",
};

/**
 * /studio/[cle] — piste B : la prochaine action en haut (les images à juger),
 * puis le tableau photo × prompt d'angle pour préparer le prochain sac.
 */
export default function Fiche({ fiche }: { fiche: FicheClient }) {
  const router = useRouter();
  const modeles = useModeles();
  const { coloris } = fiche;
  const [cible, setCible] = useState<string | null>(fiche.cibles[0] ?? null);
  const cibleValide = cible && fiche.cibles.includes(cible) ? cible : fiche.cibles[0] ?? null;

  const parId = new Map((modeles.catalogue?.modeles ?? []).map((m) => [m.id, m]));
  const nomDe = (id: string) => (id === MODELE_MANUEL ? "Dépôt manuel (Gemini)" : parId.get(id)?.nom ?? id);

  // ── Avis IA : un à la fois, dans l'ordre d'arrivée ────────────────────────
  const [avisEnCours, setAvisEnCours] = useState<Set<string>>(new Set());
  const fileAvis = useRef<string[]>([]);
  const enMarche = useRef(false);
  async function pomper() {
    if (enMarche.current) return;
    enMarche.current = true;
    while (fileAvis.current.length > 0) {
      const id = fileAvis.current.shift()!;
      setAvisEnCours((s) => new Set(s).add(id));
      await demanderAvis(id, () => router.push("/compte"));
      setAvisEnCours((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
      router.refresh();
    }
    enMarche.current = false;
  }
  const lancerAvis = (ids: string[]) => {
    fileAvis.current.push(...ids.filter((id) => !fileAvis.current.includes(id)));
    void pomper();
  };

  const file = fiche.essais
    .filter((e) => e.decision === null && !e.purge)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // Un essai sans avis (avis échoué, page rechargée) : relancé une fois à l'ouverture.
  const relances = useRef(false);
  useEffect(() => {
    if (relances.current) return;
    relances.current = true;
    const sansAvis = file.filter((e) => e.verifIA === null).map((e) => e.id);
    if (sansAvis.length > 0) lancerAvis(sansAvis);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une seule fois, à l'ouverture
  }, []);

  const libres = Object.values(fiche.cases).filter((c) => c.kind === "libre").length;
  const total = Object.keys(fiche.cases).length;

  return (
    <Frame>
      <BandeauSacbase etat={fiche.sacbase} />

      <Module className="p-[22px]">
        <div className="flex flex-wrap items-center gap-5">
          <div className="flex h-[92px] w-[92px] flex-none items-center justify-center overflow-hidden rounded-[18px] border border-[var(--border)] bg-surface">
            {fiche.vignette ? (
              // eslint-disable-next-line @next/next/no-img-element -- relais privé /api/studio/vignette
              <img src={fiche.vignette} alt={`Vignette SacBase ${coloris.coloris}`} className="h-[84px] w-auto object-contain" />
            ) : (
              <span className="font-mono text-[11px] text-[var(--ink2)]">{coloris.modele}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[13px]">
              <Link href="/studio" className="inline-flex items-center gap-0.5 font-semibold text-[var(--ink2)] hover:text-[var(--ink)]">
                <ChevronLeft size={15} /> Coloris
              </Link>
              <span className="font-mono text-[11px] tracking-[0.14em] text-[var(--ink2)]">
                {[fiche.generation, coloris.modele].filter(Boolean).join(" · ")}
              </span>
            </div>
            <h1 className="mt-0.5 text-[28px] font-bold leading-tight tracking-[-0.02em]">{coloris.coloris || coloris.cle}</h1>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {fiche.sacs.length === 0 && <span className="text-[13px] text-[var(--warn)]">Hors catalogue SacBase</span>}
              {fiche.sacs.map((s) => {
                const estCible = s.sku === cibleValide;
                const choisissable = fiche.cibles.includes(s.sku);
                return (
                  <button
                    key={s.sku}
                    type="button"
                    disabled={!choisissable}
                    aria-pressed={estCible}
                    title={choisissable ? "Préparer les photos de ce sac" : s.statut}
                    onClick={() => setCible(s.sku)}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors disabled:cursor-default ${
                      estCible
                        ? "border-[var(--acc)] bg-[var(--acc-soft)] text-[var(--ink)]"
                        : "border-[var(--border)] bg-surface text-[var(--ink2)] enabled:hover:border-[var(--border-strong)]"
                    }`}
                  >
                    <span className="font-mono font-bold text-[var(--ink)]">{s.sku}</span>
                    {STATUT_LIBELLE[s.statut] ?? s.statut.toLowerCase()}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex gap-2.5">
            <Kpi titre="VRAIES PHOTOS" valeur={String(fiche.lignes.length)} />
            <Kpi titre="VARIANTES LIBRES" valeur={String(libres)} suffixe={` / ${total}`} />
            <Kpi titre="À JUGER" valeur={String(file.length)} alerte={file.length > 0} />
          </div>
        </div>
        <DetailsVerifies cle={coloris.cle} details={coloris.details} />
      </Module>

      <ImportPrises cle={coloris.cle} prisesOccupees={fiche.lignes.map((l) => l.ordre)} />

      {file.length > 0 && (
        <FileAJuger fiche={fiche} file={file} nomDe={nomDe} catalogue={parId} avisEnCours={avisEnCours} onAvis={(id) => lancerAvis([id])} />
      )}

      <TableauCases fiche={fiche} cible={cibleValide} modeles={modeles} onNouveaux={lancerAvis} />
    </Frame>
  );
}

function Kpi({ titre, valeur, suffixe, alerte = false }: { titre: string; valeur: string; suffixe?: string; alerte?: boolean }) {
  return (
    <div className={`min-w-[128px] rounded-[18px] px-4 py-3 ${alerte ? "bg-[var(--warn-soft)]" : "bg-[var(--surface-2)]"}`}>
      <div className="font-mono text-[10.5px] tracking-[0.14em] text-[var(--ink2)]">{titre}</div>
      <div className="mt-1 font-mono text-[24px] font-bold leading-none">
        {valeur}
        {suffixe && <span className="text-[14px] font-medium text-[var(--ink2)]">{suffixe}</span>}
      </div>
    </div>
  );
}

/** Les détails que l'avis IA vérifie, un par ligne. Repliés : ils ne servent qu'au contrôle. */
function DetailsVerifies({ cle, details }: { cle: string; details: string }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [texte, setTexte] = useState(details);
  const [envoi, setEnvoi] = useState(false);
  const n = detailsEnLignes(details).length;

  async function enregistrer() {
    if (texte === details || envoi) return;
    setEnvoi(true);
    const res = await fetch(`/api/studio/coloris/${encodeURIComponent(cle)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ details: texte }),
    });
    setEnvoi(false);
    if (!res.ok) toast.error(await lireErreur(res));
    router.refresh();
  }

  return (
    <div className="mt-4 border-t border-[var(--border)] pt-3">
      <button type="button" aria-expanded={ouvert} onClick={() => setOuvert((o) => !o)} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[var(--ink2)] hover:text-[var(--ink)]">
        <ChevronDown size={15} className={`transition-transform ${ouvert ? "" : "-rotate-90"}`} />
        Détails vérifiés par l’IA <span className="font-mono text-[12px] font-medium">{n}</span>
      </button>
      {ouvert && (
        <div className="mt-2 flex flex-col gap-2">
          <p className="text-[13px] text-[var(--ink2)]">Un par ligne. L’avis IA contrôle chacun sur l’image générée ; ils ne partent pas dans le prompt.</p>
          <textarea
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            rows={4}
            placeholder={"patch ELITE côté gauche\nswoosh blanc cassé\nzip noir mat"}
            className={`${champ} font-mono text-[12.5px]`}
          />
          <div>
            <button type="button" className={btn} disabled={texte === details || envoi} onClick={() => void enregistrer()}>
              <Save size={14} /> {envoi ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
