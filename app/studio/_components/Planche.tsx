"use client";

import { useEffect, useRef, useState, useTransition, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Upload } from "lucide-react";

import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { pluriel } from "@/lib/format";
import { toastAvertissement, toastErreur, toastSucces } from "@/lib/toast";
import { MAX_PRISES, nomPrise } from "@/lib/studioCases";

import { deplacer, messageSurplus, repartirDepot } from "../_parcours";
import { ACCEPT, changerPrise, fichiersImages, lireErreur, preparer, remplacerPhoto } from "./envoi";
import { parNom } from "./lancer";
import MenuPhoto from "./MenuPhoto";
import { SectionEtape } from "./SectionEtape";

const PHOTOS_PAR_ENVOI = 12;
const OCTETS_PAR_ENVOI = 3_500_000;

/** The refusal of the API (409) when a photo already gave a variant, said plainly. */
export const REFUS_PHOTO_SERVIE = "Cette photo a déjà servi à une variante : elle reste sur la planche.";

type Photo = { id: string; ordre: number };

const avecFichiers = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");
const num = (o: number) => String(o).padStart(2, "0");

/**
 * Step 1, the board: 15 cells, one per shot. ONE way to arrange it: drag a
 * photo onto its shot (on an occupied cell, both swap); from the keyboard, the
 * photo's menu offers « Déplacer vers… ». A drop of files fills the free
 * cells and NAMES what does not fit. Each photo can be replaced or removed;
 * a photo that already gave a variant cannot (the API refuses it, and the
 * menu says so beforehand).
 */
export default function Planche({
  cle,
  generation,
  lignes,
  servies,
  numero,
  ouverte,
  courante,
  onBasculer,
}: {
  cle: string;
  generation: string | null;
  lignes: readonly Photo[];
  /** Photos with at least one variant (any decision): neither removable nor replaceable. */
  servies: ReadonlySet<string | null>;
  numero: number;
  ouverte: boolean;
  courante: boolean;
  onBasculer: () => void;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const inputRemplacement = useRef<HTMLInputElement>(null);
  const caseVisee = useRef<number | null>(null);
  const aRemplacer = useRef<Photo | null>(null);
  const [envoi, setEnvoi] = useState<string | null>(null);
  // Local copy: a move shows at once, the server follows. While a move is in
  // flight, an older server read must not overwrite it (the photo would come
  // back then leave again): server rows are copied once every move is confirmed.
  const [photos, setPhotos] = useState<readonly Photo[]>(lignes);
  const enVol = useRef(0);
  useEffect(() => {
    if (enVol.current === 0) {
      setPhotos(lignes);
      return;
    }
    setPhotos((actuelles) => {
      const connues = new Set(actuelles.map((p) => p.id));
      const surServeur = new Set(lignes.map((l) => l.id));
      return [...actuelles.filter((p) => surServeur.has(p.id)), ...lignes.filter((l) => !connues.has(l.id))];
    });
  }, [lignes]);
  const [rafraichit, demarrer] = useTransition();
  const rafraichir = () => demarrer(() => router.refresh());
  const occupe = !!envoi || rafraichit;
  const [glissee, setGlissee] = useState<string | null>(null);
  const [survol, setSurvol] = useState<number | "section" | null>(null);
  const [eclair, setEclair] = useState<number[]>([]);
  const minuteurEclair = useRef<number | null>(null);
  const [annonce, setAnnonce] = useState("");
  const [enCours, setEnCours] = useState<{ id: string; texte: string } | null>(null);
  const [retrait, setRetrait] = useState<Photo | null>(null);

  const parOrdre = new Map(photos.map((p) => [p.ordre, p]));
  const libres = Array.from({ length: MAX_PRISES }, (_, i) => i + 1).filter((o) => !parOrdre.has(o));
  const nom = (o: number) => nomPrise(o, generation);

  // ── Import: fill the free cells, name the surplus ──────────────────────────
  async function importer(liste: File[], visee: number | null = null) {
    const fichiers = fichiersImages(liste).sort(parNom);
    if (fichiers.length === 0 || occupe) return;
    const { places, surplus } = repartirDepot(fichiers, libres, visee);
    const signalerSurplus = () => surplus.length > 0 && toastAvertissement(messageSurplus(surplus.map((f) => f.name)));
    if (places.length === 0) {
      signalerSurplus();
      return;
    }
    let ok = 0;
    try {
      const prets: { jpeg: Blob; empreinte: string; ordre: number }[] = [];
      const illisibles: string[] = [];
      for (let i = 0; i < places.length; i++) {
        setEnvoi(`Préparation ${i + 1} / ${places.length}…`);
        const p = await preparer(places[i].fichier);
        // An unreadable file leaves ITS cell empty: the others keep theirs.
        if (!p.ok) illisibles.push(`${p.nom} : ${p.erreur}`);
        else prets.push({ jpeg: p.jpeg, empreinte: p.empreinte, ordre: places[i].ordre });
      }
      if (illisibles.length > 0) toastErreur(illisibles.join(" · "));
      let lot: typeof prets = [];
      let octets = 0;
      let doublons = 0;
      const envoyer = async () => {
        if (lot.length === 0) return;
        const form = new FormData();
        form.set("origine", "studio");
        form.set("cle", cle);
        if (generation) form.set("generation", generation);
        for (const p of lot) {
          form.append("photo", p.jpeg, `${p.empreinte}.jpg`);
          form.append("empreinte", p.empreinte);
          form.append("ordre", String(p.ordre));
        }
        setEnvoi(`Envoi ${ok + 1}–${ok + lot.length} / ${prets.length}…`);
        const res = await fetch("/api/studio/references", { method: "POST", body: form });
        if (!res.ok) throw new Error(await lireErreur(res));
        const j = (await res.json()) as { conservees?: number; doublons?: number };
        doublons += j.doublons ?? 0;
        ok += j.conservees ?? 0;
        lot = [];
        octets = 0;
      };
      for (const p of prets) {
        if (lot.length >= PHOTOS_PAR_ENVOI || (lot.length > 0 && octets + p.jpeg.size > OCTETS_PAR_ENVOI)) await envoyer();
        lot.push(p);
        octets += p.jpeg.size;
      }
      await envoyer();
      if (ok > 0) toastSucces(`${pluriel(ok, "photo importée", "photos importées")} sur la planche.`);
      if (doublons > 0) toastAvertissement(`${pluriel(doublons, "photo déjà sur la planche, ignorée", "photos déjà sur la planche, ignorées")}.`);
      signalerSurplus();
    } catch (e) {
      toastErreur(`Import interrompu après ${pluriel(ok, "photo", "photos")} : ${e instanceof Error ? e.message : "connexion perdue"}`);
    } finally {
      setEnvoi(null);
      rafraichir();
    }
  }

  // ── Arrange: drag, or « Déplacer vers… » from the menu ─────────────────────
  async function ranger(id: string, ordre: number) {
    const source = photos.find((p) => p.id === id);
    if (!source || source.ordre === ordre) return;
    const occupant = parOrdre.get(ordre);
    setPhotos((actuelles) => deplacer(actuelles, id, ordre));
    setAnnonce(
      occupant ? `${nom(source.ordre)} rangée sous ${nom(ordre)}, échangée avec ${nom(ordre)}.` : `${nom(source.ordre)} rangée sous ${nom(ordre)}.`,
    );
    setEclair([source.ordre, ordre]);
    if (minuteurEclair.current) window.clearTimeout(minuteurEclair.current);
    minuteurEclair.current = window.setTimeout(() => setEclair([]), 900);
    enVol.current++;
    let erreur: string | null;
    try {
      erreur = await changerPrise(id, ordre, generation);
    } catch {
      erreur = "Connexion perdue : réessaie.";
    }
    enVol.current--;
    if (erreur) toastErreur(erreur);
    // One re-read after the last move: it holds them all, and undoes a failed one.
    if (enVol.current === 0) rafraichir();
  }

  // ── Remove (DELETE, refused with 409 when the photo served) ────────────────
  async function retirer(photo: Photo) {
    setEnCours({ id: photo.id, texte: "Retrait…" });
    try {
      const res = await fetch(`/api/studio/references/${photo.id}`, { method: "DELETE" });
      if (res.status === 409) toastErreur(REFUS_PHOTO_SERVIE);
      else if (!res.ok) toastErreur(`Retrait impossible : ${await lireErreur(res)}`);
      else {
        toastSucces(`Photo ${nom(photo.ordre)} retirée de la planche.`);
        setPhotos((actuelles) => actuelles.filter((p) => p.id !== photo.id));
      }
    } catch {
      toastErreur("Connexion perdue : la photo reste sur la planche.");
    } finally {
      setEnCours(null);
      setRetrait(null);
      rafraichir();
    }
  }

  // ── Replace: the old photo leaves the board (kept, out of it), the new one takes its cell ──
  async function remplacer(photo: Photo, f: File | undefined) {
    if (!f) return;
    setEnCours({ id: photo.id, texte: "Remplacement…" });
    try {
      const refus = await remplacerPhoto({ cle, generation, photo, fichier: f });
      if (refus) toastErreur(refus === "servie" ? REFUS_PHOTO_SERVIE : refus);
      else toastSucces(`Photo ${nom(photo.ordre)} remplacée.`);
    } finally {
      setEnCours(null);
      rafraichir();
    }
  }

  const choisirFichiers = () => {
    caseVisee.current = null;
    input.current?.click();
  };

  const nbServies = photos.filter((p) => servies.has(p.id)).length;

  return (
    <SectionEtape
      etape="photos"
      numero={numero}
      titre="Photos"
      ouverte={ouverte}
      courante={courante}
      onBasculer={onBasculer}
      survolee={survol === "section"}
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
      resume={
        <>
          <span className="font-semibold text-ink">
            {photos.length} / {MAX_PRISES} prises
          </span>
          {libres.length > 0 && photos.length > 0 && <span> · {pluriel(libres.length, "case libre", "cases libres")}</span>}
        </>
      }
      actions={
        <Button variant={photos.length === 0 ? "primary" : "secondary"} size="sm" pending={!!envoi} pendingLabel={envoi ?? undefined} disabled={rafraichit && !envoi} onClick={choisirFichiers}>
          <Upload size={15} aria-hidden /> Ajouter des photos
        </Button>
      }
    >
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          void importer(Array.from(e.target.files ?? []), caseVisee.current);
          caseVisee.current = null;
          e.target.value = "";
        }}
      />
      <input
        ref={inputRemplacement}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          const cible = aRemplacer.current;
          aRemplacer.current = null;
          if (cible) void remplacer(cible, e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      <p className="max-w-[65ch] text-base text-ink-2">
        {photos.length === 0
          ? "14 à 15 vraies photos, toujours les mêmes prises. Dépose-les d’un coup sur la planche : elles prennent les cases libres dans l’ordre des noms de fichier."
          : "Glisse chaque photo sur sa prise : sur une case occupée, les deux s’échangent. Au clavier : menu de la photo, puis « Déplacer vers »."}
        {nbServies > 0 && ` ${pluriel(nbServies, "photo a", "photos ont")} déjà servi : elles restent sur la planche.`}
      </p>
      <p role="status" className="sr-only">
        {annonce}
      </p>

      <ol aria-label="Planche des prises" className="mt-4 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(148px,1fr))]">
        {Array.from({ length: MAX_PRISES }, (_, i) => i + 1).map((ordre) => {
          const photo = parOrdre.get(ordre);
          const dessus = survol === ordre;
          const eclaire = eclair.includes(ordre);
          const servie = !!photo && servies.has(photo.id);
          const occupation = photo && enCours?.id === photo.id ? enCours.texte : null;
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
              // Constant border width: the highlight is a ring (box-shadow), which takes no room.
              className={cn(
                "relative flex flex-col gap-2 rounded-md border p-2 transition-[background-color,border-color,box-shadow] duration-fast",
                dessus
                  ? "border-accent bg-accent-soft ring-1 ring-accent"
                  : eclaire
                    ? "border-warn bg-warn-soft ring-1 ring-warn"
                    : photo
                      ? "border-line bg-surface-2"
                      : "border-dashed border-line-strong bg-surface",
              )}
            >
              <div className="flex min-h-9 items-start gap-1.5 pl-0.5">
                <span className="pt-0.5 font-mono text-xs font-semibold text-ink-2">{num(ordre)}</span>
                <span className="line-clamp-2 min-w-0 flex-1 text-sm font-semibold leading-snug text-ink">{nom(ordre)}</span>
                {photo && (
                  <MenuPhoto
                    ordre={ordre}
                    generation={generation}
                    occupees={parOrdre}
                    servie={servie}
                    desactive={!!occupation}
                    onDeplacer={(o) => void ranger(photo.id, o)}
                    onRemplacer={() => {
                      aRemplacer.current = photo;
                      inputRemplacement.current?.click();
                    }}
                    onRetirer={() => setRetrait(photo)}
                  />
                )}
              </div>
              {photo ? (
                <div
                  draggable={!occupation}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", photo.id);
                    // After the browser captured the drag image, or it would be faded too.
                    window.setTimeout(() => setGlissee(photo.id), 0);
                  }}
                  onDragEnd={() => {
                    setGlissee(null);
                    setSurvol(null);
                  }}
                  className={cn(
                    "relative aspect-[3/4] w-full cursor-grab overflow-hidden rounded-sm bg-surface-3 active:cursor-grabbing",
                    glissee === photo.id && "opacity-40",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- image privée servie par /api/studio/image */}
                  <img src={`/api/studio/image?ref=${photo.id}`} alt={`Photo ${nom(ordre)}`} loading="lazy" draggable={false} className="h-full w-full object-cover" />
                  {servie && (
                    <span className="absolute bottom-1.5 left-1.5 rounded-xs bg-surface px-1.5 py-0.5 text-xs font-semibold text-ink-2">A servi</span>
                  )}
                  {occupation && (
                    <span role="status" className="absolute inset-0 flex items-center justify-center bg-veil text-sm font-semibold text-ink">
                      <span className="rounded-xs bg-surface px-2 py-1">{occupation}</span>
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-1.5 rounded-sm px-2 text-center text-sm text-ink-3">
                  <ImagePlus size={18} aria-hidden />
                  {dessus ? "Lâche ici" : "Glisse une photo ici"}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <AlertDialog
        open={retrait !== null}
        onOpenChange={(o) => !o && setRetrait(null)}
        title={retrait ? `Retirer la photo « ${nom(retrait.ordre)} » ?` : "Retirer la photo ?"}
        description="Elle quitte la planche et la bibliothèque du Studio. Sa case redevient libre pour une autre photo."
        confirmLabel="Retirer"
        pending={!!retrait && enCours?.id === retrait.id}
        pendingLabel="Retrait…"
        onConfirm={() => retrait && void retirer(retrait)}
      />
    </SectionEtape>
  );
}
