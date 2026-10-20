"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Upload } from "lucide-react";
import { toast } from "sonner";
import { Module } from "@/components/console";
import { MAX_PRISES, PRISES } from "@/lib/studioCases";
import { btnAcc } from "../_ui";
import { ACCEPT, fichiersImages, lireErreur, preparer } from "./envoi";
import { parNom } from "./lancer";

const PHOTOS_PAR_ENVOI = 12;
const OCTETS_PAR_ENVOI = 3_500_000;

/**
 * « Photographie le sac » : les 14 à 15 vraies photos, toujours les mêmes
 * prises, déposées dans l'ordre de la liste. Chaque photo prend le numéro de
 * la première prise encore vide ; on corrige ensuite ligne par ligne.
 */
export default function ImportPrises({ cle, prisesOccupees }: { cle: string; prisesOccupees: number[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [envoi, setEnvoi] = useState<string | null>(null);
  const [survol, setSurvol] = useState(false);
  const occupees = new Set(prisesOccupees);
  const libres = Array.from({ length: MAX_PRISES }, (_, i) => i + 1).filter((o) => !occupees.has(o));
  const complet = libres.length === 0;

  async function importer(liste: File[]) {
    const fichiers = fichiersImages(liste).sort(parNom);
    if (fichiers.length === 0 || envoi) return;
    if (fichiers.length > libres.length) {
      toast.error(`${fichiers.length} photos pour ${libres.length} prise${libres.length > 1 ? "s" : ""} libre${libres.length > 1 ? "s" : ""} : retire-en d’abord.`);
      return;
    }
    let ok = 0;
    try {
      const prets: { jpeg: Blob; empreinte: string; ordre: number; nom: string }[] = [];
      for (let i = 0; i < fichiers.length; i++) {
        setEnvoi(`Préparation ${i + 1} / ${fichiers.length}…`);
        const p = await preparer(fichiers[i]);
        if (!p.ok) {
          toast.error(`${p.nom} : ${p.erreur}`);
          return; // l'ordre des prises compte : on ne saute pas une photo en silence
        }
        prets.push({ jpeg: p.jpeg, empreinte: p.empreinte, ordre: libres[i], nom: p.nom });
      }
      let lot: typeof prets = [];
      let octets = 0;
      const envoyer = async () => {
        if (lot.length === 0) return;
        const form = new FormData();
        form.set("origine", "studio");
        form.set("cle", cle);
        for (const p of lot) {
          form.append("photo", p.jpeg, `${p.empreinte}.jpg`);
          form.append("empreinte", p.empreinte);
          form.append("ordre", String(p.ordre));
        }
        setEnvoi(`Envoi ${ok + 1}–${ok + lot.length} / ${prets.length}…`);
        const res = await fetch("/api/studio/references", { method: "POST", body: form });
        if (!res.ok) throw new Error(await lireErreur(res));
        const j = (await res.json()) as { conservees?: number; doublons?: number };
        if (j.doublons) toast.warning(`${j.doublons} photo${j.doublons > 1 ? "s" : ""} déjà dans le tableau, ignorée${j.doublons > 1 ? "s" : ""}.`);
        ok += lot.length;
        lot = [];
        octets = 0;
      };
      for (const p of prets) {
        if (lot.length >= PHOTOS_PAR_ENVOI || (lot.length > 0 && octets + p.jpeg.size > OCTETS_PAR_ENVOI)) await envoyer();
        lot.push(p);
        octets += p.jpeg.size;
      }
      await envoyer();
      toast.success(`${ok} photo${ok > 1 ? "s" : ""} importée${ok > 1 ? "s" : ""}.`);
    } catch (e) {
      toast.error(`Import interrompu après ${ok} photo${ok > 1 ? "s" : ""} : ${e instanceof Error ? e.message : "erreur inconnue"}`);
    } finally {
      setEnvoi(null);
      router.refresh();
    }
  }

  if (complet) return null;

  return (
    <Module className="p-[22px]">
      <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
        <h2 className="text-[20px] font-bold tracking-[-0.01em]">Photographie le sac</h2>
        <span className="text-[14px] text-[var(--ink2)]">
          14 à 15 vraies photos, toujours les mêmes prises. Chacune servira de base à ses variantes d’angle.
        </span>
      </div>
      <div className="mt-4 grid gap-[18px] [grid-template-columns:minmax(0,1fr)_300px]">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setSurvol(true);
          }}
          onDragLeave={() => setSurvol(false)}
          onDrop={(e) => {
            e.preventDefault();
            setSurvol(false);
            void importer(Array.from(e.dataTransfer.files));
          }}
          className={`flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-[18px] border-2 border-dashed p-6 text-center transition-colors ${
            survol ? "border-[var(--acc)] bg-[var(--acc-soft)]" : "border-[var(--border-strong)] bg-[var(--surface-2)]"
          }`}
        >
          <span className="text-[16px] font-semibold">
            {occupees.size === 0 ? "Glisse les photos ici, dans l’ordre de la liste" : `Glisse les ${libres.length} prises manquantes`}
          </span>
          <span className="text-[13.5px] text-[var(--ink2)]">
            Triées par nom de fichier. Chaque photo prend le nom de sa prise ; tu corriges ensuite si besoin.
          </span>
          <button type="button" className={`${btnAcc} mt-2 h-11 rounded-full px-5`} disabled={!!envoi} onClick={() => input.current?.click()}>
            <Upload size={15} /> {envoi ?? "Importer les photos"}
          </button>
          <input
            ref={input}
            type="file"
            accept={ACCEPT}
            multiple
            hidden
            onChange={(e) => {
              void importer(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </div>
        <ol className="flex flex-col gap-1 text-[13.5px]">
          {PRISES.map((nom, i) => {
            const fait = occupees.has(i + 1);
            return (
              <li key={nom} className={`flex items-center gap-2.5 ${fait ? "text-[var(--ink2)]" : ""}`}>
                <span
                  className={`flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full font-mono text-[10.5px] font-semibold ${
                    fait ? "bg-[var(--acc)] text-[var(--acc-ink)]" : "bg-[var(--surface-2)] text-[var(--ink2)]"
                  }`}
                >
                  {fait ? <Check size={12} aria-label="importée" /> : String(i + 1).padStart(2, "0")}
                </span>
                {nom}
              </li>
            );
          })}
        </ol>
      </div>
    </Module>
  );
}
