"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { Module } from "@/components/console";
import { MAX_PRISES, nomPrise } from "@/lib/studioCases";
import { btn, btnAcc } from "../_ui";
import { ACCEPT, changerPrise, fichiersImages, lireErreur, preparer } from "./envoi";
import { parNom } from "./lancer";

const PHOTOS_PAR_ENVOI = 12;
const OCTETS_PAR_ENVOI = 3_500_000;

type Photo = { id: string; ordre: number };

const avecFichiers = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

/**
 * « Photographie le sac » : une planche de 15 cases, une par prise. Les photos
 * importées prennent les cases libres dans l'ordre des noms de fichier ; on les
 * range ensuite en les glissant d'une case à l'autre (sur une case occupée,
 * les deux s'échangent). Sans souris : toucher une photo, puis sa case.
 */
export default function ImportPrises({ cle, lignes }: { cle: string; lignes: readonly Photo[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const cibleFichiers = useRef<number | null>(null);
  const [envoi, setEnvoi] = useState<string | null>(null);
  // Copie locale : un déplacement s'affiche tout de suite, le serveur suit.
  const [photos, setPhotos] = useState<readonly Photo[]>(lignes);
  useEffect(() => setPhotos(lignes), [lignes]);
  const [glissee, setGlissee] = useState<string | null>(null);
  const [survol, setSurvol] = useState<number | "section" | null>(null);
  const [choisie, setChoisie] = useState<string | null>(null);
  const [eclair, setEclair] = useState<number[]>([]);

  const parOrdre = new Map(photos.map((p) => [p.ordre, p]));
  const libres = Array.from({ length: MAX_PRISES }, (_, i) => i + 1).filter((o) => !parOrdre.has(o));

  async function importer(liste: File[], cible: number | null = null) {
    const fichiers = fichiersImages(liste).sort(parNom);
    if (fichiers.length === 0 || envoi) return;
    // Déposées sur une case vide : la première photo va dans cette case.
    const ordres = cible !== null && libres.includes(cible) ? [cible, ...libres.filter((o) => o !== cible)] : libres;
    if (fichiers.length > ordres.length) {
      toast.error(`${fichiers.length} photos pour ${ordres.length} prise${ordres.length > 1 ? "s" : ""} libre${ordres.length > 1 ? "s" : ""} : retire-en d’abord.`);
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
        prets.push({ jpeg: p.jpeg, empreinte: p.empreinte, ordre: ordres[i], nom: p.nom });
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
        if (j.doublons) toast.warning(`${j.doublons} photo${j.doublons > 1 ? "s" : ""} déjà sur la planche, ignorée${j.doublons > 1 ? "s" : ""}.`);
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

  async function ranger(id: string, ordre: number) {
    setChoisie(null);
    const source = photos.find((p) => p.id === id);
    if (!source || source.ordre === ordre) return;
    const avant = photos;
    setPhotos(photos.map((p) => (p.id === id ? { ...p, ordre } : p.ordre === ordre ? { ...p, ordre: source.ordre } : p)));
    setEclair([source.ordre, ordre]);
    setTimeout(() => setEclair([]), 900);
    const erreur = await changerPrise(id, ordre);
    if (erreur) {
      toast.error(erreur);
      setPhotos(avant);
    }
    router.refresh();
  }

  function choisirFichiers(cible: number | null) {
    cibleFichiers.current = cible;
    input.current?.click();
  }

  const nomChoisie = choisie ? nomPrise(photos.find((p) => p.id === choisie)?.ordre ?? 0) : null;

  return (
    <Module className="p-[22px]">
      <div
        onDragOver={(e) => {
          if (!avecFichiers(e)) return;
          e.preventDefault();
          if (survol === null) setSurvol("section");
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSurvol(null);
        }}
        onDrop={(e) => {
          if (!avecFichiers(e)) return;
          e.preventDefault();
          setSurvol(null);
          void importer(Array.from(e.dataTransfer.files));
        }}
        className={`flex flex-col gap-3.5 rounded-[18px] transition-colors ${survol === "section" ? "bg-[var(--acc-soft)]" : ""}`}
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h2 className="text-[20px] font-bold tracking-[-0.01em]">Photographie le sac</h2>
          <span className="rounded-full bg-[var(--acc-soft)] px-2.5 py-1 font-mono text-[12px] font-semibold text-[var(--acc)]">
            {photos.length} / {MAX_PRISES} prises
          </span>
          <div className="flex-1" />
          <button type="button" className={`${btnAcc} h-10 rounded-full px-4`} disabled={!!envoi || libres.length === 0} onClick={() => choisirFichiers(null)}>
            <Upload size={15} /> {envoi ?? "Ajouter des photos"}
          </button>
          <input
            ref={input}
            type="file"
            accept={ACCEPT}
            multiple
            hidden
            onChange={(e) => {
              void importer(Array.from(e.target.files ?? []), cibleFichiers.current);
              cibleFichiers.current = null;
              e.target.value = "";
            }}
          />
        </div>
        <p className="text-[14px] leading-relaxed text-[var(--ink2)]">
          {photos.length === 0
            ? "14 à 15 vraies photos, toujours les mêmes prises. Dépose-les ici : elles prennent les cases dans l’ordre des noms de fichier, tu les ranges ensuite en les glissant."
            : "Glisse chaque photo sur sa prise : sur une case occupée, les deux s’échangent. Sans souris, touche une photo puis la case où la ranger."}
        </p>

        {choisie && (
          <div className="flex flex-wrap items-center gap-2.5 rounded-[14px] bg-[var(--warn-soft)] px-3.5 py-2.5 text-[14px]">
            <span>
              Photo <b>{nomChoisie}</b> sélectionnée : touche la case où la ranger.
            </span>
            <button type="button" className={`${btn} h-8 rounded-full`} onClick={() => setChoisie(null)}>
              Annuler
            </button>
          </div>
        )}

        <ol
          className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(128px,1fr))] sm:gap-3 sm:[grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]"
          aria-label="Planche des prises"
        >
          {Array.from({ length: MAX_PRISES }, (_, i) => i + 1).map((ordre) => {
            const photo = parOrdre.get(ordre);
            const dessus = survol === ordre;
            const eclaire = eclair.includes(ordre);
            return (
              <li
                key={ordre}
                onDragOver={(e) => {
                  if (!glissee && !avecFichiers(e)) return;
                  e.preventDefault();
                  e.stopPropagation();
                  if (survol !== ordre) setSurvol(ordre);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null) && survol === ordre) setSurvol(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSurvol(null);
                  if (avecFichiers(e)) void importer(Array.from(e.dataTransfer.files), photo ? null : ordre);
                  else if (glissee) void ranger(glissee, ordre);
                  setGlissee(null);
                }}
                className={`flex flex-col gap-2 rounded-[16px] border p-2 transition-colors ${
                  dessus
                    ? "border-2 border-[var(--acc)] bg-[var(--acc-soft)]"
                    : eclaire
                      ? "border-2 border-[var(--warn)] bg-[var(--warn-soft)]"
                      : photo
                        ? "border-[var(--border)] bg-[var(--surface-2)]"
                        : "border-dashed border-[var(--border-strong)] bg-[var(--surface-2)]"
                }`}
              >
                <div className="flex min-h-5 items-baseline gap-2 px-0.5">
                  <span className="font-mono text-[11px] font-semibold text-[var(--ink2)]">{String(ordre).padStart(2, "0")}</span>
                  <span className="truncate text-[13.5px] font-semibold">{nomPrise(ordre)}</span>
                </div>
                {photo ? (
                  <button
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", photo.id);
                      setChoisie(null);
                      setGlissee(photo.id);
                    }}
                    onDragEnd={() => {
                      setGlissee(null);
                      setSurvol(null);
                    }}
                    onClick={() => (choisie && choisie !== photo.id ? void ranger(choisie, ordre) : setChoisie(choisie === photo.id ? null : photo.id))}
                    aria-label={`Photo rangée sous ${nomPrise(ordre)}`}
                    aria-pressed={choisie === photo.id}
                    className={`aspect-[3/4] w-full cursor-grab overflow-hidden rounded-[12px] outline-offset-2 active:cursor-grabbing ${
                      choisie === photo.id ? "outline outline-[3px] outline-[var(--warn)]" : ""
                    } ${glissee === photo.id ? "opacity-40" : ""}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- image privée servie par /api/studio/image */}
                    <img src={`/api/studio/image?ref=${photo.id}`} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" />
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!!envoi}
                    onClick={() => (choisie ? void ranger(choisie, ordre) : choisirFichiers(ordre))}
                    className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-1.5 rounded-[12px] text-[13px] text-[var(--ink2)] transition-colors hover:bg-surface disabled:opacity-50"
                  >
                    <Plus size={18} aria-hidden />
                    {choisie ? "Ranger ici" : "Dépose ici"}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </Module>
  );
}
