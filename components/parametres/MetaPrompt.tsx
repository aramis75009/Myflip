"use client";

// Générateur de méta-prompt.
//
// Écrire un bon prompt d'annonce est un métier ; le contrat technique de MyFlip
// (variables disponibles, sortie JSON à trois clés, photos jointes) ne se
// devine pas. Plutôt que de demander à l'utilisateur de le connaître, on lui
// donne un texte à coller dans ChatGPT ou Claude, qui produit un modèle
// directement utilisable — et un champ pour le récupérer sans repasser par le
// formulaire.

import { useState } from "react";
import { ClipboardCheck, Copy, Wand2 } from "lucide-react";
import { toast } from "sonner";
import Modal from "@/components/Modal";
import { CardTitle, Module } from "@/components/console";
import { useCreatePrompt } from "@/lib/hooks";
import { metaPrompt } from "@/lib/metaPrompt";

const inputCls =
  "min-h-[46px] w-full rounded-[16px] border border-[var(--border)] bg-[var(--surface-2)] px-4 text-[14px] text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--faint-2)] focus:border-[var(--acc)]";
const labelCls =
  "mb-1.5 block font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--faint)]";
const boutonCls =
  "inline-flex min-h-[46px] items-center justify-center gap-2 rounded-[16px] bg-[var(--acc)] px-5 text-[13.5px] font-semibold text-[var(--acc-ink)] transition-colors hover:bg-[var(--acc-hover)] disabled:opacity-60";
const boutonSecondaireCls =
  "inline-flex min-h-[46px] items-center justify-center gap-2 rounded-[16px] border border-[var(--border)] bg-[var(--surface-2)] px-5 text-[13.5px] text-[var(--ink2)] transition-colors hover:border-[var(--border-strong)] disabled:opacity-60";

export default function MetaPrompt() {
  const create = useCreatePrompt();
  const [open, setOpen] = useState(false);
  const [marque, setMarque] = useState("");
  const [categorie, setCategorie] = useState("");
  const [copie, setCopie] = useState(false);
  const [resultat, setResultat] = useState("");

  const texte = metaPrompt({ marque, categorie });

  async function copier() {
    try {
      await navigator.clipboard.writeText(texte);
      setCopie(true);
      setTimeout(() => setCopie(false), 2500);
    } catch {
      // Presse-papier refusé (contexte non sécurisé, permission) : le texte
      // reste sélectionnable à la main dans le champ ci-dessous.
      toast.error("Copie impossible — sélectionne le texte et copie-le.");
    }
  }

  async function enregistrer() {
    const contenu = resultat.trim();
    if (!contenu) return;
    const cible = [categorie.trim(), marque.trim()].filter(Boolean).join(" ");
    try {
      await create.mutateAsync({
        nom: cible ? `Annonce ${cible}` : "Annonce (généré)",
        marque: marque.trim() || null,
        categorie: categorie.trim() || null,
        contenu,
        // Ce générateur ne propose pas de champ prix : le modèle créé n'en
        // porte pas, quitte à ce qu'Aramis le renseigne ensuite depuis /parametres.
        prixReference: null,
        estDefaut: false,
      });
      toast.success("Modèle enregistré.");
      setResultat("");
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <Module className="p-[22px]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[12px] bg-[var(--surface-2)] text-[var(--acc)]">
                <Wand2 className="h-[19px] w-[19px]" strokeWidth={2} />
              </span>
              <CardTitle>Faire écrire un modèle par une IA</CardTitle>
            </div>
            <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-[var(--muted)]">
              Récupère un texte à coller dans ChatGPT ou Claude. Il leur
              explique ce que MyFlip attend — variables, photos jointes, format
              de sortie — et te renvoie un modèle prêt à enregistrer.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={`${boutonCls} flex-none`}
          >
            Obtenir le méta-prompt
          </button>
        </div>
      </Module>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Méta-prompt"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={boutonSecondaireCls}
            >
              Fermer
            </button>
            <button
              type="button"
              onClick={enregistrer}
              disabled={!resultat.trim() || create.isPending}
              className={boutonCls}
            >
              {create.isPending ? "Enregistrement…" : "Enregistrer le modèle"}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="mp-marque">
                Marque visée
              </label>
              <input
                id="mp-marque"
                value={marque}
                onChange={(e) => setMarque(e.target.value)}
                placeholder="Toutes"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="mp-categorie">
                Catégorie visée
              </label>
              <input
                id="mp-categorie"
                value={categorie}
                onChange={(e) => setCategorie(e.target.value)}
                placeholder="Toutes"
                className={inputCls}
              />
            </div>
          </div>
          <p className="-mt-1 text-[12px] leading-snug text-[var(--faint)]">
            Laisse vide pour un modèle polyvalent, qui servira de repli quand
            aucun modèle plus précis ne correspond.
          </p>

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className={`${labelCls} mb-0`}>1. Copie ce texte</span>
              <button
                type="button"
                onClick={copier}
                className={`${boutonSecondaireCls} min-h-[38px] px-3 text-[12.5px]`}
              >
                {copie ? (
                  <>
                    <ClipboardCheck className="h-3.5 w-3.5" />
                    Copié
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copier
                  </>
                )}
              </button>
            </div>
            <textarea
              readOnly
              value={texte}
              rows={9}
              onFocus={(e) => e.currentTarget.select()}
              className={`${inputCls} resize-y py-3 font-mono text-[11.5px] leading-relaxed`}
            />
          </div>

          <div>
            <label className={labelCls} htmlFor="mp-resultat">
              2. Colle ici ce que l&apos;IA t&apos;a répondu
            </label>
            <textarea
              id="mp-resultat"
              value={resultat}
              onChange={(e) => setResultat(e.target.value)}
              rows={7}
              placeholder="Le modèle de prompt renvoyé par ChatGPT ou Claude…"
              className={`${inputCls} resize-y py-3 text-[13px] leading-relaxed`}
            />
            <p className="mt-1.5 text-[12px] leading-snug text-[var(--faint)]">
              Relis-le avant d&apos;enregistrer : il doit contenir les variables
              entre accolades et demander une réponse en JSON.
            </p>
          </div>
        </div>
      </Modal>
    </>
  );
}
