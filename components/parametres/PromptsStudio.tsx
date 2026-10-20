"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Plus, SquarePen, Trash2 } from "lucide-react";
import { toast } from "sonner";
import Loader from "@/components/Loader";
import { Module } from "@/components/console";
import { LONGUEUR_MAX_ANGLE, LONGUEUR_MAX_MAITRE, LONGUEUR_MAX_NOM } from "@/lib/studioPrompts";

// Onglet « Studio » de /parametres : le prompt maître (envoyé une fois par
// conversation Gemini, en tête de chaque génération par API) et les prompts
// d'angle courts, une colonne chacun dans la fiche coloris du Studio.
//
// Les exemples de la maquette ne sont pas amorcés : Aramis saisit les siens.

export type PromptsStudioDTO = {
  promptMaitre: string;
  modifieLe: string | null;
  angles: { id: string; nom: string; angle: string; ordre: number; cases: number; skus: string[] }[];
};

const CLE = ["studio-prompts"];

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const j = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new Error(j?.error ?? `Erreur ${res.status}`);
  return j as T;
}

export function usePromptsStudio() {
  return useQuery({ queryKey: CLE, queryFn: () => jsonFetch<PromptsStudioDTO>("/api/studio/reglages") });
}

const boutonCls =
  "inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[var(--border)] bg-surface px-4 text-[14px] font-semibold text-[var(--ink2)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-45";
const boutonAccCls =
  "inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[var(--acc)] px-5 text-[14px] font-semibold text-[var(--acc-ink)] transition-colors hover:bg-[var(--acc-hover)] disabled:cursor-not-allowed disabled:opacity-50";
const champCls =
  "w-full rounded-[14px] border border-[var(--border-strong)] bg-surface px-3.5 text-[15px] text-[var(--ink)] outline-none transition-colors focus:border-[var(--acc)] focus:ring-2 focus:ring-[var(--acc-ring)]";
const microCls = "font-mono text-[11px] tracking-[0.14em] text-[var(--ink2)]";

const dateFr = (iso: string) => new Date(iso).toLocaleDateString("fr-FR");
const num = (i: number) => String(i + 1).padStart(2, "0");

async function copier(texte: string, quoi: string) {
  try {
    await navigator.clipboard.writeText(texte);
    toast.success(`${quoi} copié.`);
  } catch {
    toast.error("Copie refusée par le navigateur.");
  }
}

export default function PromptsStudio() {
  const qc = useQueryClient();
  const { data, isLoading, error } = usePromptsStudio();
  const [selId, setSelId] = useState<string | null>(null);
  const [maitre, setMaitre] = useState<string | null>(null); // null = lecture
  const [edition, setEdition] = useState<{ id: string | null; nom: string; angle: string } | null>(null);

  const rafraichir = () => qc.invalidateQueries({ queryKey: CLE });

  const enregistrerMaitre = useMutation({
    mutationFn: (promptMaitre: string) => jsonFetch("/api/studio/reglages", { method: "PUT", body: JSON.stringify({ promptMaitre }) }),
    onSuccess: () => {
      setMaitre(null);
      toast.success("Prompt maître enregistré.");
      void rafraichir();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const enregistrerAngle = useMutation({
    mutationFn: (e: { id: string | null; nom: string; angle: string }) =>
      e.id
        ? jsonFetch<{ id: string; version: boolean }>(`/api/studio/angles/${e.id}`, { method: "PATCH", body: JSON.stringify({ nom: e.nom, angle: e.angle }) })
        : jsonFetch<{ id: string }>("/api/studio/angles", { method: "POST", body: JSON.stringify({ nom: e.nom, angle: e.angle }) }),
    onSuccess: (r) => {
      setEdition(null);
      setSelId(r.id);
      toast.success("version" in r && r.version ? "Nouvelle version créée : les cases déjà prises gardent l’ancien texte." : "Prompt d’angle enregistré.");
      void rafraichir();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const supprimer = useMutation({
    mutationFn: (id: string) => jsonFetch(`/api/studio/angles/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setSelId(null);
      void rafraichir();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Loader label="Chargement des prompts du Studio" />;
  if (error || !data) return <Module>Prompts du Studio illisibles : {(error as Error | null)?.message ?? "erreur inconnue"}</Module>;

  const angles = data.angles;
  const i = Math.max(0, angles.findIndex((a) => a.id === selId));
  const sel = angles[i] ?? null;
  const nouveau = () => setEdition({ id: null, nom: "", angle: "Angle: " });

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[14px] text-[var(--ink2)]">Le prompt maître fixe la règle, chaque prompt d’angle ne dit que le déplacement de la caméra.</span>
        <button type="button" className={`${boutonAccCls} ml-auto`} onClick={nouveau}>
          <Plus size={16} strokeWidth={2.3} /> Nouveau prompt d’angle
        </button>
      </div>

      <Module className="p-[22px_24px]">
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5">
          <h2 className="text-[20px] font-bold tracking-[-0.01em]">Prompt maître</h2>
          <span className="inline-flex h-[26px] items-center rounded-full bg-[var(--surface-2)] px-2.5 text-[13px] font-semibold text-[var(--ink2)]">
            Envoyé une fois, en début de conversation
          </span>
          <div className="ml-auto flex gap-2">
            <button type="button" className={boutonCls} disabled={!data.promptMaitre} onClick={() => void copier(data.promptMaitre, "Prompt maître")}>
              <Copy size={15} /> Copier
            </button>
            {maitre === null && (
              <button type="button" className={boutonCls} onClick={() => setMaitre(data.promptMaitre)}>
                <SquarePen size={15} /> Modifier
              </button>
            )}
          </div>
        </div>
        <div className="mt-4 grid gap-[18px] min-[900px]:grid-cols-[minmax(0,1fr)_300px]">
          {maitre === null ? (
            <div className="whitespace-pre-wrap rounded-[18px] border border-[var(--border)] bg-[var(--surface-2)] px-5 py-[18px] font-mono text-[13.5px] leading-[1.75] text-[var(--ink)]">
              {data.promptMaitre || <span className="text-[var(--ink2)]">Pas encore de prompt maître : sans lui, seul le prompt d’angle part.</span>}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <textarea
                value={maitre}
                onChange={(e) => setMaitre(e.target.value)}
                rows={9}
                maxLength={LONGUEUR_MAX_MAITRE}
                aria-label="Prompt maître"
                className={`${champCls} py-3 font-mono text-[13.5px] leading-[1.7]`}
              />
              <div className="flex gap-2">
                <button type="button" className={boutonAccCls} disabled={enregistrerMaitre.isPending} onClick={() => enregistrerMaitre.mutate(maitre)}>
                  {enregistrerMaitre.isPending ? "Enregistrement…" : "Enregistrer"}
                </button>
                <button type="button" className={boutonCls} onClick={() => setMaitre(null)}>
                  Annuler
                </button>
              </div>
            </div>
          )}
          <dl className="flex flex-col gap-3.5 text-[14px]">
            <div>
              <dt className={microCls}>À LA MAIN</dt>
              <dd className="mt-1">Collé dans une nouvelle conversation Gemini Pro, avant la première photo.</dd>
            </div>
            <div>
              <dt className={microCls}>PAR API</dt>
              <dd className="mt-1">Placé en tête de chaque génération, suivi du prompt d’angle.</dd>
            </div>
            <div>
              <dt className={microCls}>LONGUEUR</dt>
              <dd className="mt-1 font-mono text-[13px]">{(maitre ?? data.promptMaitre).length} caractères</dd>
            </div>
            {data.modifieLe && (
              <div>
                <dt className={microCls}>MODIFIÉ</dt>
                <dd className="mt-1">le {dateFr(data.modifieLe)}</dd>
              </div>
            )}
          </dl>
        </div>
      </Module>

      <section className="grid items-start gap-[14px] min-[900px]:grid-cols-[320px_minmax(0,1fr)]">
        <Module className="p-4">
          <div className="mb-3 flex items-baseline justify-between gap-3 px-1 pt-0.5">
            <span className="text-[17px] font-semibold tracking-[-0.01em]">Prompts d’angle</span>
            <span className="text-[13px] text-[var(--ink2)]">
              {angles.length} actif{angles.length > 1 ? "s" : ""}
            </span>
          </div>
          {angles.length === 0 ? (
            <p className="px-1 py-6 text-center text-[13.5px] text-[var(--ink2)]">Aucun prompt d’angle. Chacun devient une colonne de la fiche coloris.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {angles.map((a, k) => {
                const actif = k === i && !edition;
                return (
                  <button
                    key={a.id}
                    type="button"
                    aria-pressed={actif}
                    onClick={() => {
                      setSelId(a.id);
                      setEdition(null);
                    }}
                    className={`block min-h-16 w-full rounded-[16px] border px-3.5 py-[11px] text-left transition-colors ${
                      actif
                        ? "border-[var(--acc)] bg-[var(--acc)] text-[var(--acc-ink)]"
                        : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--ink)] hover:border-[var(--border-strong)]"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-[11.5px] opacity-75">{num(k)}</span>
                      <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{a.nom}</span>
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[12px] opacity-80">{a.angle}</span>
                  </button>
                );
              })}
            </div>
          )}
        </Module>

        <Module className="min-w-0 p-[22px_24px]">
          {edition ? (
            <FormulaireAngle
              edition={edition}
              utilise={edition.id ? (angles.find((a) => a.id === edition.id)?.cases ?? 0) > 0 : false}
              enCours={enregistrerAngle.isPending}
              onChange={setEdition}
              onEnregistrer={() => enregistrerAngle.mutate(edition)}
              onAnnuler={() => setEdition(null)}
            />
          ) : sel ? (
            <>
              <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5">
                <div className="min-w-0">
                  <div className={microCls}>PROMPT D’ANGLE {num(i)}</div>
                  <h2 className="mt-1 text-[22px] font-bold tracking-[-0.01em]">{sel.nom}</h2>
                </div>
                <div className="ml-auto flex gap-2">
                  <button type="button" className={boutonCls} onClick={() => setEdition({ id: sel.id, nom: sel.nom, angle: sel.angle })}>
                    <SquarePen size={15} /> Modifier
                  </button>
                  <button
                    type="button"
                    aria-label="Supprimer"
                    title={sel.cases > 0 ? "Déjà utilisé : ne peut plus être supprimé" : "Supprimer"}
                    disabled={sel.cases > 0 || supprimer.isPending}
                    onClick={() => window.confirm(`Supprimer « ${sel.nom} » ?`) && supprimer.mutate(sel.id)}
                    className={`${boutonCls} w-11 justify-center px-0`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              <div className="mt-[18px] grid gap-4 min-[900px]:grid-cols-2">
                <div>
                  <div className="text-[13.5px] font-semibold">Nom court</div>
                  <div className="mt-0.5 text-[13px] text-[var(--ink2)]">L’en-tête de colonne dans le Studio.</div>
                  <div className="mt-2 flex min-h-[46px] items-center rounded-[14px] border border-[var(--border-strong)] px-3.5 text-[15px]">{sel.nom}</div>
                </div>
                <div>
                  <div className="text-[13.5px] font-semibold">Utilisation</div>
                  <div className="mt-0.5 text-[13px] text-[var(--ink2)]">Cases déjà prises sur tous les coloris.</div>
                  <div className="mt-2 flex min-h-[46px] items-center gap-2.5 rounded-[14px] bg-[var(--surface-2)] px-3.5 text-[14px]">
                    <span className="font-mono text-[15px] font-bold">{sel.cases}</span>
                    <span className="truncate text-[var(--ink2)]">
                      {sel.cases
                        ? `case${sel.cases > 1 ? "s" : ""}${sel.skus.length ? ` · ${sel.skus.join(", ")}` : ""}`
                        : "aucune case prise : modifiable sans risque"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-[18px]">
                <div className="text-[13.5px] font-semibold">Texte envoyé</div>
                <div className="mt-0.5 text-[13px] text-[var(--ink2)]">Une phrase, en anglais : seulement le déplacement de la caméra ou de l’objet.</div>
                <div className="mt-2 rounded-[16px] border border-[var(--border-strong)] px-4 py-3.5 font-mono text-[14px] leading-relaxed">{sel.angle}</div>
              </div>

              <div className="mt-[22px] rounded-[20px] bg-[var(--surface-2)] px-[18px] py-4">
                <div className={microCls}>CE QUI PART POUR UNE PHOTO</div>
                <ol className="mt-3 flex flex-col gap-2.5 text-[14px]">
                  <li className="flex items-center gap-3">
                    <Rond n={1} />
                    <span>
                      <strong>Prompt maître</strong> <span className="text-[var(--ink2)]">· une seule fois par conversation, Gemini répond OK</span>
                    </span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Rond n={2} />
                    <span className="flex h-[52px] w-[39px] flex-none items-center justify-center rounded-lg border border-[var(--border)] bg-surface font-mono text-[9.5px] text-[var(--ink2)]">
                      photo
                    </span>
                    <span className="min-w-0 rounded-xl bg-surface px-3 py-2 font-mono text-[13px]">{sel.angle}</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Rond n={3} />
                    <span className="text-[var(--ink2)]">Photo suivante, prompt d’angle suivant, dans la même conversation.</span>
                  </li>
                </ol>
              </div>
            </>
          ) : (
            <p className="py-16 text-center text-[14px] text-[var(--ink2)]">
              Ajoute ton premier prompt d’angle : une phrase comme « Angle: camera about 8° to the right, same height and distance. »
            </p>
          )}
        </Module>
      </section>
    </>
  );
}

function Rond({ n }: { n: number }) {
  return <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-surface text-[12.5px] font-bold">{n}</span>;
}

function FormulaireAngle({
  edition,
  utilise,
  enCours,
  onChange,
  onEnregistrer,
  onAnnuler,
}: {
  edition: { id: string | null; nom: string; angle: string };
  utilise: boolean;
  enCours: boolean;
  onChange: (e: { id: string | null; nom: string; angle: string }) => void;
  onEnregistrer: () => void;
  onAnnuler: () => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onEnregistrer();
      }}
      className="flex flex-col gap-4"
    >
      <div className={microCls}>{edition.id ? "MODIFIER LE PROMPT D’ANGLE" : "NOUVEAU PROMPT D’ANGLE"}</div>
      {utilise && (
        <p className="rounded-xl border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2 text-[13.5px]">
          Ce prompt a déjà pris des cases. Changer son texte crée une nouvelle version : les cases prises gardent l’ancien, la colonne repart libre.
        </p>
      )}
      <label className="block">
        <span className="text-[13.5px] font-semibold">Nom court</span>
        <span className="mt-0.5 block text-[13px] text-[var(--ink2)]">L’en-tête de colonne dans le Studio.</span>
        <input
          value={edition.nom}
          onChange={(e) => onChange({ ...edition, nom: e.target.value })}
          maxLength={LONGUEUR_MAX_NOM}
          placeholder="8° à droite"
          className={`${champCls} mt-2 h-[46px]`}
        />
      </label>
      <label className="block">
        <span className="text-[13.5px] font-semibold">Texte envoyé</span>
        <span className="mt-0.5 block text-[13px] text-[var(--ink2)]">Une phrase, en anglais : seulement le déplacement de la caméra ou de l’objet.</span>
        <textarea
          value={edition.angle}
          onChange={(e) => onChange({ ...edition, angle: e.target.value })}
          maxLength={LONGUEUR_MAX_ANGLE}
          rows={3}
          placeholder="Angle: camera about 8° to the right, same height and distance."
          className={`${champCls} mt-2 py-3 font-mono text-[14px] leading-relaxed`}
        />
      </label>
      <div className="flex gap-2">
        <button type="submit" className={boutonAccCls} disabled={enCours || !edition.nom.trim() || !edition.angle.trim()}>
          {enCours ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button type="button" className={boutonCls} onClick={onAnnuler}>
          Annuler
        </button>
      </div>
    </form>
  );
}
