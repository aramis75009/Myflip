"use client";

import { useEffect, useState } from "react";
import { Plus, Check, SquarePen, Trash2, Target } from "lucide-react";
import { toast } from "sonner";
import {
  PromptInput,
  useCreatePrompt,
  useDeletePrompt,
  useObjectifMensuel,
  usePrompts,
  useReglages,
  useSetObjectif,
  useUpdatePrompt,
} from "@/lib/hooks";
import type { PromptTemplateDTO } from "@/lib/types";
import { euros } from "@/lib/calc";
import { libelleModele } from "@/lib/modelesIA";
import { useIdentite } from "@/lib/useIdentite";
import Modal from "@/components/Modal";
import MetaPrompt from "@/components/parametres/MetaPrompt";
import Loader from "@/components/Loader";
import { CardTitle, Frame, Module } from "@/components/console";

const inputCls =
  "min-h-[44px] w-full rounded-[16px] border border-[var(--border)] bg-[var(--surface-2)] px-3.5 text-[14px] text-[var(--ink)] outline-none transition-colors focus:border-[var(--acc)]";

const labelCls =
  "mb-1.5 block font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--faint)]";

const TOUTES = "Toutes";

const MARQUES_LIST = [
  "Nike",
  "Adidas",
  "Puma",
  "Lacoste",
  "Lacoste Sport",
  "Reebok",
  "Under Armour",
  "Fila",
  "Le Coq Sportif",
  "Champion",
  "Columbia",
  "Hurley",
  "Ralph Lauren",
  "Tommy Hilfiger",
  "Levi's",
];

const CATEGORIES_LIST = [
  "Short",
  "Polo",
  "Pull",
  "Chemise",
  "Veste",
  "Sweat",
  "Jogging",
  "Jean",
  "Bermuda",
];

// Jeton de marque. Direction C n'accorde de couleur qu'aux statuts et aux
// canaux (cf. `lib/statutColors.ts`) ; les marques passent donc par le jeton
// neutre de la maquette — le nom porte déjà l'information, la teinte ne
// faisait que la répéter en trois palettes codées en dur.
const chipCls =
  "rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 font-mono text-[10.5px] text-[var(--ink2)]";

type FormState = {
  nom: string;
  marque: string;
  categorie: string;
  contenu: string;
  estDefaut: boolean;
};

const emptyForm = (): FormState => ({
  nom: "",
  marque: TOUTES,
  categorie: TOUTES,
  contenu: "",
  estDefaut: false,
});

// Carte de réglage de l'objectif de CA mensuel. Porté par le compte
// (UserSettings.objectifMensuel), plus par le localStorage.
function ObjectifMensuelCard() {
  const { objectif: saved } = useObjectifMensuel();
  const enregistrer = useSetObjectif();
  const [value, setValue] = useState("");
  // La saisie suit la valeur du serveur tant que l'utilisateur n'a rien tapé.
  const [touche, setTouche] = useState(false);
  useEffect(() => {
    if (!touche) setValue(saved != null ? String(saved) : "");
  }, [saved, touche]);

  const save = () => {
    const brut = value.trim() === "" ? null : Number(value);
    const n = brut != null && Number.isFinite(brut) && brut > 0 ? brut : null;
    enregistrer.mutate(n, {
      onSuccess: () => {
        setTouche(false);
        toast.success(
          n != null
            ? `Objectif mensuel fixé à ${euros(n)}.`
            : "Objectif mensuel retiré.",
        );
      },
      onError: (e) => toast.error((e as Error).message),
    });
  };

  return (
    <Module className="p-[22px]">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[12px] bg-[var(--surface-2)] text-[var(--acc)]">
          <Target className="h-[19px] w-[19px]" strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--ink)]">
            Objectif de CA mensuel
          </div>
          <div className="mt-[3px] font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--faint)]">
            Anneau de progression du Dashboard · mois en cours
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <input
            type="number"
            inputMode="numeric"
            min="0"
            value={value}
            onChange={(e) => {
              setTouche(true);
              setValue(e.target.value);
            }}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="0"
            className="min-h-[44px] w-44 rounded-[16px] border border-[var(--border)] bg-[var(--surface-2)] px-4 pr-9 text-[15px] font-semibold text-[var(--ink)] outline-none transition-colors focus:border-[var(--acc)]"
          />
          <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 font-mono text-[13px] text-[var(--faint)]">
            €
          </span>
        </div>
        <button
          onClick={save}
          className="min-h-[44px] rounded-full bg-[var(--acc)] px-5 text-[12.5px] font-semibold text-[var(--acc-ink)] transition-colors hover:bg-[var(--acc-hover)]"
        >
          Enregistrer
        </button>
        {saved != null && (
          <span className="font-mono text-[12px] text-[var(--ink2)]">
            Actuel · <b className="text-[var(--ink)]">{euros(saved)}</b>
          </span>
        )}
      </div>
    </Module>
  );
}

export default function PromptsPage() {
  const { nom: NOM, email, initiale } = useIdentite();
  const { data: prompts = [], isLoading } = usePrompts();
  // La tuile « Modèle IA » lisait « Gemini Flash » en dur. Depuis que le modèle
  // se choisit dans /compte, une valeur figée y serait simplement fausse.
  const { data: reglages } = useReglages();
  const create = useCreatePrompt();
  const update = useUpdatePrompt();
  const del = useDeletePrompt();

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function openNew() {
    setEditId(null);
    setForm(emptyForm());
    setError(null);
    setOpen(true);
  }

  function openEdit(p: PromptTemplateDTO) {
    setEditId(p.id);
    setForm({
      nom: p.nom,
      marque: p.marque ?? TOUTES,
      categorie: p.categorie ?? TOUTES,
      contenu: p.contenu,
      estDefaut: p.estDefaut,
    });
    setError(null);
    setOpen(true);
  }

  async function submit() {
    if (!form.nom.trim()) return setError("Le nom est requis.");
    if (!form.contenu.trim()) return setError("Le contenu est requis.");
    const input: PromptInput = {
      nom: form.nom.trim(),
      marque: form.marque === TOUTES ? null : form.marque,
      categorie: form.categorie === TOUTES ? null : form.categorie,
      contenu: form.contenu.trim(),
      estDefaut: form.estDefaut,
    };
    try {
      if (editId) await update.mutateAsync({ id: editId, input });
      else await create.mutateAsync(input);
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // Prompt affiché dans le panneau. `selected` se recale sur le premier
  // modèle tant qu'aucun choix explicite n'a été fait — et après une
  // suppression, où l'id retenu ne correspond plus à rien.
  const selected =
    prompts.find((p) => p.id === selectedId) ?? prompts[0] ?? null;

  const pending = create.isPending || update.isPending;

  return (
    <Frame>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <button
          onClick={openNew}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[var(--acc)] px-5 text-[12.5px] font-semibold text-[var(--acc-ink)] transition-colors hover:bg-[var(--acc-hover)]"
        >
          <Plus className="h-4 w-4" strokeWidth={2.3} />
          Nouveau prompt
        </button>
      </div>

      <div className="grid grid-cols-1 gap-[14px] min-[900px]:grid-cols-[1.4fr_1fr_1fr]">
        {/* Carte compte. Prénom, initiale et e-mail viennent tous de la session
            via useIdentite, comme dans le Dashboard et AccountMenu. */}
        <Module className="flex items-center gap-3.5 p-[20px]">
          <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-[var(--acc)] text-[18px] font-bold text-[var(--acc-ink)]">
            {initiale}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[15.5px] font-bold text-[var(--ink)]">
              {NOM || "—"}
            </span>
            <span className="mt-0.5 block truncate font-mono text-[11px] text-[var(--faint)]">
              {email || "—"}
            </span>
          </span>
        </Module>
        <Module className="p-[20px]">
          <div className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-[var(--faint)]">
            MODÈLE IA
          </div>
          <div className="mt-2 truncate text-[30px] font-bold tracking-[-0.02em]">
            {libelleModele(reglages?.modeleIA ?? null)}
          </div>
        </Module>
        <Module className="p-[20px]">
          <div className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-[var(--faint)]">
            MODÈLES ENREGISTRÉS
          </div>
          <div className="mt-2 text-[30px] font-bold tracking-[-0.02em]">
            {prompts.length}
          </div>
        </Module>
      </div>

      {/* Objectif mensuel (#15) — réglé ici, affiché en anneau sur le Dashboard */}
      <ObjectifMensuelCard />

      {/* Écrire un prompt qui respecte le contrat de l'application ne
          s'improvise pas : on délègue la rédaction à un LLM externe, à qui on
          fournit ce contrat. */}
      <MetaPrompt />

      {/* ── Maître-détail : colonne de sélection 300 px + panneau ────────
          La maquette range les prompts en liste étroite plutôt qu'en grille
          de cartes : à 15 modèles la grille obligeait à balayer la page pour
          comparer deux libellés. L'édition reste dans la modale — le panneau
          est en lecture, comme la maquette qui n'y pose aucun champ. */}
      <section className="grid grid-cols-1 gap-[14px] min-[900px]:grid-cols-[300px_1fr]">

        {/* Colonne de sélection */}
        <Module className="p-[16px]">
          <div className="mb-3 flex items-center justify-between">
            <CardTitle className="">Prompts</CardTitle>
            <button
              onClick={openNew}
              aria-label="Nouveau prompt"
              className="flex h-11 w-11 flex-none items-center justify-center rounded-[14px] bg-[var(--acc)] text-[var(--acc-ink)] transition-colors hover:bg-[var(--acc-hover)]"
            >
              <Plus className="h-4 w-4" strokeWidth={2.4} />
            </button>
          </div>

          {isLoading && <Loader size="sm" />}

          {!isLoading && prompts.length === 0 && (
            <p className="py-6 text-center font-mono text-[11px] text-[var(--faint)]">
              Aucun prompt.
            </p>
          )}

          {prompts.map((p) => {
            const actif = p.id === selected?.id;
            return (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={`mb-2 block min-h-[56px] w-full rounded-[16px] border px-3.5 py-3 text-left transition-colors ${
                  actif
                    ? "border-[var(--acc)] bg-[var(--acc)] text-[var(--acc-ink)]"
                    : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--ink)] hover:border-[var(--border-strong)]"
                }`}
              >
                <span className="block truncate text-[13.5px] font-semibold">
                  {p.nom}
                </span>
                <span
                  className={`mt-[3px] block truncate font-mono text-[9.5px] uppercase tracking-[0.1em] ${
                    actif ? "opacity-70" : "text-[var(--faint)]"
                  }`}
                >
                  {p.marque ?? "TOUTES MARQUES"} · {p.categorie ?? "TOUTES CATÉGORIES"}
                  {p.estDefaut ? " · DÉFAUT" : ""}
                </span>
              </button>
            );
          })}
        </Module>

        {/* Panneau de détail */}
        <Module className="flex flex-col gap-[14px] p-[22px]">
          {selected ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <span className="text-[17px] font-bold tracking-[-0.02em]">
                  {selected.nom}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => openEdit(selected)}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-4 text-[12.5px] text-[var(--ink2)] transition-colors hover:border-[var(--border-strong)]"
                  >
                    <SquarePen className="h-3.5 w-3.5" strokeWidth={2} />
                    Modifier
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Supprimer le prompt « ${selected.nom} » ?`)) {
                        del.mutate(selected.id);
                        setSelectedId(null);
                      }
                    }}
                    aria-label="Supprimer"
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[var(--faint)] transition-colors hover:border-[var(--neg)] hover:text-[var(--neg)]"
                  >
                    <Trash2 className="h-[15px] w-[15px]" strokeWidth={2} />
                  </button>
                </div>
              </div>

              {/* Le corps du prompt : chasse fixe, interligne large — c'est du
                  texte qu'on relit et qu'on ajuste, pas de la prose. */}
              <div className="min-h-[220px] whitespace-pre-wrap rounded-[18px] border border-[var(--border)] bg-[var(--surface-2)] p-4 font-mono text-[12.5px] leading-[1.7] text-[var(--ink2)]">
                {selected.contenu}
              </div>

              <div className="flex flex-wrap gap-2">
                <span className={chipCls}>{selected.marque ?? "Toutes marques"}</span>
                <span className={chipCls}>
                  {selected.categorie ?? "Toutes catégories"}
                </span>
                {selected.estDefaut && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--acc)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--acc-ink)]">
                    <Check className="h-3 w-3" strokeWidth={2.6} />
                    Défaut
                  </span>
                )}
                <span className="rounded-full border border-[var(--border)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--faint)]">
                  Modifié le {new Date(selected.updatedAt).toLocaleDateString("fr-FR")}
                </span>
              </div>
            </>
          ) : (
            <p className="py-16 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--faint)]">
              {prompts.length > 0
                ? "Sélectionne un prompt"
                : "Crée ton premier prompt"}
            </p>
          )}
        </Module>
      </section>

      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        title={editId ? "Modifier le prompt" : "Nouveau prompt"}
      >
        <div className="max-h-[70vh] space-y-4 overflow-y-auto">
          <div>
            <label className={labelCls}>
              Nom
            </label>
            <input
              value={form.nom}
              onChange={(e) => setForm({ ...form, nom: e.target.value })}
              placeholder="Ex : Polo Lacoste"
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>
                Marque
              </label>
              <input
                value={form.marque}
                onChange={(e) => setForm({ ...form, marque: e.target.value })}
                list="marques-list"
                placeholder="Ex : Lacoste"
                className={inputCls}
              />
              <datalist id="marques-list">
                {MARQUES_LIST.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>
            <div>
              <label className={labelCls}>
                Catégorie
              </label>
              <input
                value={form.categorie}
                onChange={(e) => setForm({ ...form, categorie: e.target.value })}
                list="categories-list"
                placeholder="Ex : Short"
                className={inputCls}
              />
              <datalist id="categories-list">
                {CATEGORIES_LIST.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          </div>

          <div>
            <label className={labelCls}>
              Contenu du prompt
            </label>
            <p className="mb-2 rounded-[12px] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 font-mono text-[11px] leading-[1.7] text-[var(--ink2)]">
              Placeholders disponibles : <code>{"{marque}"}</code>,{" "}
              <code>{"{categorie}"}</code>, <code>{"{taille}"}</code>,{" "}
              <code>{"{etat}"}</code>, <code>{"{matiere}"}</code>,{" "}
              <code>{"{sku}"}</code>. La réponse doit être un JSON avec les clés{" "}
              <code>titre</code>, <code>description</code>, <code>motsCles</code>.
            </p>
            <textarea
              value={form.contenu}
              onChange={(e) => setForm({ ...form, contenu: e.target.value })}
              rows={10}
              placeholder="Rédige une annonce pour ce {marque} {categorie}…"
              className={`${inputCls} resize-y font-mono text-[13px]`}
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2.5 text-[14px] text-[var(--ink)]">
            <input
              type="checkbox"
              checked={form.estDefaut}
              onChange={(e) => setForm({ ...form, estDefaut: e.target.checked })}
              className="h-4 w-4 cursor-pointer accent-[var(--acc)]"
            />
            Définir comme prompt par défaut
          </label>

          {error && (
            <p className="font-mono text-[12px] text-[var(--neg)]">{error}</p>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button
              onClick={() => setOpen(false)}
              disabled={pending}
              className="min-h-[44px] rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-4 text-[12.5px] font-medium text-[var(--ink2)] transition-colors hover:border-[var(--border-strong)] disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              onClick={submit}
              disabled={pending}
              className="min-h-[44px] rounded-full bg-[var(--acc)] px-5 text-[12.5px] font-semibold text-[var(--acc-ink)] transition-colors hover:bg-[var(--acc-hover)] disabled:opacity-60"
            >
              {pending ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>
      </Modal>
    </Frame>
  );
}
