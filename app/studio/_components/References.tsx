"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { CardTitle, Module } from "@/components/console";
import { ROLES_REFERENCE, ROLE_LIBELLES } from "@/lib/studioAngles";
import { Badge, btn } from "../_ui";
import { ACCEPT, fichiersImages, lireErreur, preparer, type Prepare } from "./envoi";
import type { RefClient } from "./FicheColoris";

/** Photos par requête : le corps reste sous la limite de 4,5 Mo de Vercel. */
const PAR_ENVOI = 4;

type Recap = { nom: string; ok: boolean; message: string }[];

/**
 * La bibliothèque de vraies photos du coloris. Import manuel en lot (spec §3) :
 * le SKU est facultatif, le rôle suit l'ordre (face, dos, côté…) et se corrige
 * photo par photo.
 */
export default function References({ cle, references }: { cle: string; references: RefClient[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [survol, setSurvol] = useState(false);
  const [envoi, setEnvoi] = useState<string | null>(null);
  const [recap, setRecap] = useState<Recap | null>(null);

  async function importer(fichiers: File[]) {
    if (fichiers.length === 0 || envoi) return;
    const r: Recap = [];
    const prets: Extract<Prepare, { ok: true }>[] = [];
    for (let i = 0; i < fichiers.length; i++) {
      setEnvoi(`Préparation ${i + 1}/${fichiers.length}…`);
      const p = await preparer(fichiers[i]);
      if (p.ok) prets.push(p);
      else r.push({ nom: p.nom, ok: false, message: p.erreur });
    }
    let position = references.length;
    for (let i = 0; i < prets.length; i += PAR_ENVOI) {
      const lot = prets.slice(i, i + PAR_ENVOI);
      setEnvoi(`Envoi ${Math.min(i + PAR_ENVOI, prets.length)}/${prets.length}…`);
      const form = new FormData();
      form.set("origine", "studio");
      form.set("cle", cle);
      form.set("position", String(position));
      for (const p of lot) {
        form.append("photo", p.jpeg, `${p.empreinte}.jpg`);
        form.append("empreinte", p.empreinte);
      }
      try {
        const res = await fetch("/api/studio/references", { method: "POST", body: form });
        if (!res.ok) throw new Error(await lireErreur(res));
        const j = (await res.json()) as { conservees: number; doublons: number };
        position += j.conservees;
        // Le serveur ne dit pas lesquelles étaient en double : le compte suffit.
        r.push({
          nom: lot.map((p) => p.nom).join(", "),
          ok: true,
          message: j.doublons > 0 ? `${j.conservees} conservée(s), ${j.doublons} déjà en bibliothèque` : `${j.conservees} conservée(s)`,
        });
      } catch (e) {
        for (const p of lot) r.push({ nom: p.nom, ok: false, message: e instanceof Error ? e.message : "envoi impossible" });
      }
    }
    setEnvoi(null);
    setRecap(r);
    router.refresh();
  }

  async function changerRole(id: string, role: string) {
    const res = await fetch(`/api/studio/references/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) toast.error(await lireErreur(res));
    router.refresh();
  }

  async function retirer(id: string) {
    if (!window.confirm("Retirer cette photo de la bibliothèque ?")) return;
    const res = await fetch(`/api/studio/references/${id}`, { method: "DELETE" });
    if (!res.ok) toast.error(await lireErreur(res));
    router.refresh();
  }

  return (
    <Module>
      <CardTitle aside={`${references.length} VRAIE${references.length > 1 ? "S" : ""} PHOTO${references.length > 1 ? "S" : ""}`}>
        Références
      </CardTitle>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setSurvol(true);
        }}
        onDragLeave={() => setSurvol(false)}
        onDrop={(e) => {
          e.preventDefault();
          setSurvol(false);
          void importer(fichiersImages(e.dataTransfer.files));
        }}
        className={`flex flex-col gap-3 rounded-2xl border-2 border-dashed p-3 transition-colors ${survol ? "border-[var(--acc)] bg-[var(--acc-soft)]" : "border-[var(--border)]"}`}
      >
        {references.length === 0 ? (
          <p className="py-6 text-center text-[13.5px] text-[var(--ink2)]">
            À photographier : aucune vraie photo pour ce coloris. Glisse des photos ici (plusieurs d’un coup), ou
            charge-les dans la mise en vente d’un de ses sacs.
          </p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
            {references.map((r) => (
              <figure key={r.id} className="flex flex-col gap-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/studio/image?ref=${r.id}`}
                  alt={`Référence ${ROLE_LIBELLES[r.role as keyof typeof ROLE_LIBELLES] ?? r.role}`}
                  loading="lazy"
                  className="aspect-[3/4] w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] object-cover"
                />
                <figcaption className="flex items-center gap-1.5">
                  <select
                    value={r.role}
                    onChange={(e) => void changerRole(r.id, e.target.value)}
                    aria-label="Rôle de la photo"
                    className="h-8 flex-1 rounded-lg border border-[var(--border)] bg-surface px-1.5 text-[12.5px] text-[var(--ink)]"
                  >
                    {ROLES_REFERENCE.map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LIBELLES[role]}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => void retirer(r.id)} className={`${btn} h-8 px-2`} aria-label="Retirer la photo">
                    <Trash2 size={13} />
                  </button>
                </figcaption>
                <div className="flex gap-1">
                  <Badge>{r.origine === "mise_en_vente" ? "MISE EN VENTE" : "STUDIO"}</Badge>
                  {r.sku && <Badge>{r.sku}</Badge>}
                </div>
              </figure>
            ))}
          </div>
        )}
        <div className="flex items-center gap-3">
          <button type="button" className={btn} onClick={() => input.current?.click()} disabled={!!envoi}>
            <Upload size={14} /> Importer des photos
          </button>
          <span className="text-[12.5px] text-[var(--ink2)]">{envoi ?? "JPEG, PNG, HEIC (Safari) — plusieurs à la fois."}</span>
          <input
            ref={input}
            type="file"
            accept={ACCEPT}
            multiple
            hidden
            onChange={(e) => {
              void importer(fichiersImages(e.target.files));
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {recap && recap.length > 0 && (
        <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[13px] font-semibold">Récapitulatif de l’import</span>
            <button type="button" className="text-[12px] text-[var(--ink2)] hover:text-[var(--ink)]" onClick={() => setRecap(null)}>
              Fermer
            </button>
          </div>
          <ul className="flex flex-col gap-1 text-[12.5px]">
            {recap.map((l, i) => (
              <li key={i} className={l.ok ? "text-[var(--ink2)]" : "font-semibold text-[var(--neg)]"}>
                {l.nom} — {l.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Module>
  );
}
