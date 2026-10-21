"use client";

import { useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { STATUT_VENDU } from "@/lib/calc";
import { CANAUX } from "@/lib/canalColors";
import { celebrateSale } from "@/lib/celebrate";
import { COMPTE_PAR_DEFAUT, COMPTES_VENTE, isCompteVente } from "@/lib/comptesVente";
import { aujourdhuiParis } from "@/lib/format";
import { useComptabiliser, useUpdateArticle } from "@/lib/hooks";
import type { ArticleDTO, CompteVente } from "@/lib/types";
import {
  compteVisible,
  validerPrix,
  valeursInitiales,
  type ArticleVendable,
  type ContexteVente,
} from "@/lib/vente";

type Props = {
  /** The article to sell; the window is open while it is not null. */
  article: ArticleVendable | null;
  contexte: ContexteVente;
  onClose: () => void;
  onVendu?: (article: ArticleDTO) => void;
};

const JOUR_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The single sale window, for the Stock (« Vendu » chosen in the status
 * select) and for À comptabiliser (« Valider »).
 *
 * Each opening starts afresh: values from `valeursInitiales`, and a mutation
 * of its own, idle (no error left over from a previous sale, ST-26).
 */
export function FenetreVente({ article, contexte, onClose, onVendu }: Props) {
  // Opening counter: a new opening remounts the content (fresh state and
  // fresh mutations). Adjusted during render, React's pattern for resetting
  // state on a prop change.
  const [ouverture, setOuverture] = useState(0);
  const [etaitOuverte, setEtaitOuverte] = useState(false);
  const [dernier, setDernier] = useState<ArticleVendable | null>(article);
  if (Boolean(article) !== etaitOuverte) {
    setEtaitOuverte(Boolean(article));
    if (article) setOuverture((n) => n + 1);
  }
  if (article && article !== dernier) setDernier(article);

  // While closing, the last article keeps the title in place.
  const affiche = article ?? dernier;
  if (!affiche) return null;

  return (
    <ContenuVente
      key={`${ouverture}-${affiche.id}`}
      article={affiche}
      ouverte={Boolean(article)}
      contexte={contexte}
      onClose={onClose}
      onVendu={onVendu}
    />
  );
}

function ContenuVente({
  article,
  ouverte,
  contexte,
  onClose,
  onVendu,
}: Omit<Props, "article"> & { article: ArticleVendable; ouverte: boolean }) {
  // The window shows the server error itself (<p role="alert">): no global toast.
  const vente = useUpdateArticle({ erreurLocale: true });
  const compta = useComptabiliser();
  const mutation = contexte === "stock" ? vente : compta;
  const pending = mutation.isPending;

  const [initiales] = useState(() => valeursInitiales(article, contexte, aujourdhuiParis()));
  const [prix, setPrix] = useState(initiales.prix);
  const [date, setDate] = useState(initiales.date);
  const [canal, setCanal] = useState(initiales.canal);
  const [compte, setCompte] = useState<CompteVente | null>(initiales.compte);
  const [erreurPrix, setErreurPrix] = useState<string | null>(null);
  const [erreurDate, setErreurDate] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const prixRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);

  const titre =
    contexte === "stock" ? `Enregistrer la vente de ${article.sku}` : `Comptabiliser la vente de ${article.sku}`;

  function fermer() {
    if (pending) return;
    onClose();
  }

  function reussi(vendu: ArticleDTO, prixSaisi: number) {
    celebrateSale(vendu.prixVente ?? prixSaisi, vendu.margeNette);
    onVendu?.(vendu);
    onClose();
  }

  function soumettre(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;

    const p = validerPrix(prix);
    if (!p.ok) {
      setErreurPrix(p.message);
      prixRef.current?.focus();
      return;
    }
    setErreurPrix(null);

    const jour = new Date(date);
    if (!JOUR_RE.test(date) || Number.isNaN(jour.getTime())) {
      setErreurDate("Indique une date de vente");
      dateRef.current?.focus();
      return;
    }
    setErreurDate(null);
    const dateVente = jour.toISOString();

    if (contexte === "stock") {
      vente.mutate(
        {
          id: article.id,
          patch: {
            statut: STATUT_VENDU,
            prixVente: p.prix,
            dateVente,
            canal,
            // The account field is hidden for channels without an account: never send its stale value.
            ...(compte && compteVisible(canal) ? { compteVente: compte } : {}),
          },
        },
        { onSuccess: (vendu) => reussi(vendu, p.prix) },
      );
    } else {
      compta.mutate(
        { id: article.id, prixVente: p.prix, dateVente, canal, compteVente: compte ?? COMPTE_PAR_DEFAUT },
        { onSuccess: ({ article: vendu }) => reussi(vendu, p.prix) },
      );
    }
  }

  return (
    <Dialog
      open={ouverte}
      onOpenChange={(suivant) => {
        if (!suivant) fermer();
      }}
      title={titre}
      size="sm"
      as="form"
      onSubmit={soumettre}
      pending={pending}
      dirty={dirty}
      initialFocus={prixRef}
      footer={
        <>
          <Button variant="secondary" aria-disabled={pending || undefined} onClick={fermer}>
            Annuler
          </Button>
          {/* Our own validation (message under the field), not the browser bubble. */}
          <Button type="submit" variant="primary" formNoValidate pending={pending} pendingLabel="Enregistrement…">
            Enregistrer la vente
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Prix de vente (€)" error={erreurPrix}>
          <Input
            ref={prixRef}
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            value={prix}
            onChange={(e) => {
              setPrix(e.target.value);
              setDirty(true);
              if (erreurPrix) setErreurPrix(null);
            }}
          />
        </Field>

        <Field label="Date de vente" error={erreurDate}>
          <Input
            ref={dateRef}
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setDirty(true);
              if (erreurDate) setErreurDate(null);
            }}
          />
        </Field>

        <Field label="Canal">
          <Select
            value={canal}
            onChange={(e) => {
              setCanal(e.target.value);
              setDirty(true);
            }}
          >
            {CANAUX.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>

        {compteVisible(canal) ? (
          <Field label="Compte de vente">
            <Select
              value={compte ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setCompte(isCompteVente(v) ? v : null);
                setDirty(true);
              }}
            >
              {compte === null ? <option value="">—</option> : null}
              {COMPTES_VENTE.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        {mutation.isError ? (
          <p role="alert" className="text-sm text-neg">
            {(mutation.error as Error).message}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
