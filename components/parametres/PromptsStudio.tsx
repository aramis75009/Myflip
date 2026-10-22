"use client";
// design-tokens-dette: R13 R15 → M9

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Plus, SquarePen, Trash2 } from "lucide-react";
import { toast } from "sonner";
import Loader from "@/components/Loader";
import { Module } from "@/components/console";
import { promptVariante } from "@/lib/studioCases";
import { LONGUEUR_MAX_ANGLE, LONGUEUR_MAX_MAITRE, LONGUEUR_MAX_NOM } from "@/lib/studioPrompts";
import BudgetStudio from "./BudgetStudio";

// Onglet « Studio » de /parametres : le prompt maître (envoyé une fois par
// conversation Gemini, en tête de chaque génération par API) et les prompts
// d'angle courts, une colonne chacun dans la fiche coloris du Studio.
//
// Les exemples de la maquette ne sont pas amorcés : Aramis saisit les siens.

export type PromptsStudioDTO = {
  promptMaitre: string;
  modifieLe: string | null;
  /** Budget d'un sac complet (€) et taux (€ pour 1 $) : GET /api/studio/reglages. */
  budgetParSacEur: number;
  tauxEurParUsd: number;
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
  "inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 text-base font-semibold text-ink-2 transition-colors hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-45";
const boutonAccCls =
  "inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-5 text-base font-semibold text-accent-ink transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50";
const champCls =
  "w-full rounded-md border border-line-strong bg-surface px-3.5 text-md text-ink outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-focus";
const microCls = "font-mono text-xs tracking-[0.14em] text-ink-2";

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
        <span className="text-base text-ink-2">Le prompt maître fixe la règle, chaque prompt d’angle ne dit que le déplacement de la caméra.</span>
        <button type="button" className={`${boutonAccCls} ml-auto`} onClick={nouveau}>
          <Plus size={16} strokeWidth={2.3} /> Nouveau prompt d’angle
        </button>
      </div>

      <BudgetStudio budget={{ budgetParSacEur: data.budgetParSacEur, tauxEurParUsd: data.tauxEurParUsd }} />

      <Module className="p-[22px_24px]">
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5">
          <h2 className="text-lg font-bold tracking-[-0.01em]">Prompt maître</h2>
          <span className="inline-flex h-[26px] items-center rounded-full bg-surface-2 px-2.5 text-sm font-semibold text-ink-2">
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
            <div className="whitespace-pre-wrap rounded-lg border border-line bg-surface-2 px-5 py-[18px] font-mono text-base leading-[1.75] text-ink">
              {data.promptMaitre || <span className="text-ink-2">Pas encore de prompt maître : sans lui, seul le prompt d’angle part.</span>}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <textarea
                value={maitre}
                onChange={(e) => setMaitre(e.target.value)}
                rows={9}
                maxLength={LONGUEUR_MAX_MAITRE}
                aria-label="Prompt maître"
                className={`${champCls} py-3 font-mono text-base leading-[1.7]`}
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
          <dl className="flex flex-col gap-3.5 text-base">
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
              <dd className="mt-1 font-mono text-sm">{(maitre ?? data.promptMaitre).length} caractères</dd>
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

      <section className="grid items-start gap-3.5 min-[900px]:grid-cols-[320px_minmax(0,1fr)]">
        <Module className="p-4">
          <div className="mb-3 flex items-baseline justify-between gap-3 px-1 pt-0.5">
            <span className="text-md font-semibold tracking-[-0.01em]">Prompts d’angle</span>
            <span className="text-sm text-ink-2">
              {angles.length} actif{angles.length > 1 ? "s" : ""}
            </span>
          </div>
          {angles.length === 0 ? (
            <p className="px-1 py-6 text-center text-base text-ink-2">Aucun prompt d’angle. Chacun devient une colonne de la fiche coloris.</p>
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
                    className={`block min-h-16 w-full rounded-md border px-3.5 py-[11px] text-left transition-colors ${
                      actif
                        ? "border-accent bg-accent text-accent-ink"
                        : "border-line bg-surface-2 text-ink hover:border-line-strong"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs opacity-75">{num(k)}</span>
                      <span className="min-w-0 flex-1 truncate text-base font-semibold">{a.nom}</span>
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-xs opacity-80">{a.angle}</span>
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
                  <h2 className="mt-1 text-lg font-bold tracking-[-0.01em]">{sel.nom}</h2>
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
                  <div className="text-base font-semibold">Nom court</div>
                  <div className="mt-0.5 text-sm text-ink-2">L’en-tête de colonne dans le Studio.</div>
                  <div className="mt-2 flex min-h-[46px] items-center rounded-md border border-line-strong px-3.5 text-md">{sel.nom}</div>
                </div>
                <div>
                  <div className="text-base font-semibold">Utilisation</div>
                  <div className="mt-0.5 text-sm text-ink-2">Cases déjà prises sur tous les coloris.</div>
                  <div className="mt-2 flex min-h-[46px] items-center gap-2.5 rounded-md bg-surface-2 px-3.5 text-base">
                    <span className="font-mono text-md font-bold">{sel.cases}</span>
                    <span className="truncate text-ink-2">
                      {sel.cases
                        ? `case${sel.cases > 1 ? "s" : ""}${sel.skus.length ? ` · ${sel.skus.join(", ")}` : ""}`
                        : "aucune case prise : modifiable sans risque"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-[18px]">
                <div className="text-base font-semibold">Texte envoyé</div>
                <div className="mt-0.5 text-sm text-ink-2">Une phrase, en anglais : seulement le déplacement de la caméra ou de l’objet.</div>
                <div className="mt-2 rounded-md border border-line-strong px-4 py-3.5 font-mono text-base leading-relaxed">{sel.angle}</div>
              </div>

              <div className="mt-[22px] rounded-lg bg-surface-2 px-[18px] py-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className={microCls}>PROMPT ENVOYÉ PAR L’API</div>
                  <button
                    type="button"
                    className={`${boutonCls} ml-auto`}
                    onClick={() => void copier(promptVariante(data.promptMaitre, sel.angle), "Prompt envoyé")}
                  >
                    <Copy size={15} /> Copier le texte exact
                  </button>
                </div>
                <p className="mt-1 text-sm text-ink-2">Mot pour mot, avec la vraie photo : le prompt maître, puis ce prompt d’angle.</p>
                <div className="mt-3 overflow-hidden rounded-md border border-line-strong bg-surface">
                  <div className="flex items-center gap-2 px-4 pt-3 text-sm font-semibold">
                    <Rond n={1} /> Prompt maître
                  </div>
                  <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words px-4 pb-3 pt-1.5 font-mono text-sm leading-relaxed text-ink">
                    {data.promptMaitre.trim() || "(vide : seul le prompt d’angle part)"}
                  </pre>
                  <div className="flex items-center gap-2 border-t border-dashed border-line-strong px-4 pt-3 text-sm font-semibold">
                    <Rond n={2} /> Prompt d’angle
                  </div>
                  <pre className="whitespace-pre-wrap break-words px-4 pb-3 pt-1.5 font-mono text-sm leading-relaxed text-ink">{sel.angle.trim()}</pre>
                </div>
                <p className="mt-3 text-sm text-ink-2">
                  À la main dans Gemini : le prompt maître se colle une fois par conversation, puis chaque photo avec son prompt d’angle.
                </p>
              </div>
            </>
          ) : (
            <p className="py-16 text-center text-base text-ink-2">
              Ajoute ton premier prompt d’angle : une phrase comme « Angle: camera about 8° to the right, same height and distance. »
            </p>
          )}
        </Module>
      </section>
    </>
  );
}

function Rond({ n }: { n: number }) {
  return <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-surface text-sm font-bold">{n}</span>;
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
        <p className="rounded-lg border border-warn bg-warn-soft px-3 py-2 text-base">
          Ce prompt a déjà pris des cases. Changer son texte crée une nouvelle version : les cases prises gardent l’ancien, la colonne repart libre.
        </p>
      )}
      <label className="block">
        <span className="text-base font-semibold">Nom court</span>
        <span className="mt-0.5 block text-sm text-ink-2">L’en-tête de colonne dans le Studio.</span>
        <input
          value={edition.nom}
          onChange={(e) => onChange({ ...edition, nom: e.target.value })}
          maxLength={LONGUEUR_MAX_NOM}
          placeholder="8° à droite"
          className={`${champCls} mt-2 h-[46px]`}
        />
      </label>
      <label className="block">
        <span className="text-base font-semibold">Texte envoyé</span>
        <span className="mt-0.5 block text-sm text-ink-2">Une phrase, en anglais : seulement le déplacement de la caméra ou de l’objet.</span>
        <textarea
          value={edition.angle}
          onChange={(e) => onChange({ ...edition, angle: e.target.value })}
          maxLength={LONGUEUR_MAX_ANGLE}
          rows={3}
          placeholder="Angle: camera about 8° to the right, same height and distance."
          className={`${champCls} mt-2 py-3 font-mono text-base leading-relaxed`}
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
