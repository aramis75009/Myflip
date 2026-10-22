"use client";

import { AlertDialog } from "@/components/ui/alert-dialog";
import { pluriel } from "@/lib/format";
import { formatEur, formatUsd, type DevisMultiModeles } from "@/lib/studioModeles";

import { libelleConfirmer, phraseConfirmation } from "../_modeles";

/**
 * The spending confirmation, over the budget or with an unknown price. The
 * button carries the amount it commits to (« Confirmer 1,34 € », rounded up
 * to the cent); the details say what each model costs. Focus starts on
 * « Annuler »: Enter never spends by reflex. `serveur`: the quote is the one
 * the server answered (409), computed with the account's budget.
 */
export default function ConfirmationDepense({
  devis,
  serveur,
  message = null,
  pending = false,
  onConfirmer,
  onFermer,
}: {
  devis: DevisMultiModeles | null;
  serveur: boolean;
  /** The server's own sentence (409), said instead of the screen's. */
  message?: string | null;
  pending?: boolean;
  onConfirmer: () => void;
  onFermer: () => void;
}) {
  return (
    <AlertDialog
      open={devis !== null}
      onOpenChange={(o) => !o && onFermer()}
      tone="neutre"
      title="Confirmer la dépense"
      description={devis ? `${message ?? phraseConfirmation(devis)} Ta clé OpenRouter paie.` : ""}
      confirmLabel={devis ? libelleConfirmer(devis) : "Confirmer"}
      pending={pending}
      pendingLabel="Lancement…"
      onConfirm={onConfirmer}
    >
      {devis && (
        <>
          <table className="w-full text-sm">
            <caption className="sr-only">Devis du lancement, modèle par modèle</caption>
            <thead>
              <tr className="text-left text-xs text-ink-3">
                <th scope="col" className="pb-1.5 font-medium">
                  Modèle
                </th>
                <th scope="col" className="pb-1.5 text-right font-medium">
                  Images
                </th>
                <th scope="col" className="pb-1.5 text-right font-medium">
                  Coût
                </th>
              </tr>
            </thead>
            <tbody>
              {devis.parModele.map((l) => (
                <tr key={l.modele} className="border-t border-line">
                  <th scope="row" className="max-w-0 truncate py-1.5 pr-2 text-left font-medium text-ink" title={l.modele}>
                    {l.nom}
                  </th>
                  <td className="whitespace-nowrap py-1.5 text-right font-mono tabular-nums text-ink-2">
                    {l.images} × {l.eurParImage === null ? "?" : formatEur(l.eurParImage)}
                  </td>
                  <td className="whitespace-nowrap py-1.5 pl-3 text-right font-mono tabular-nums text-ink">
                    {l.eur === null ? (l.raison === "jeton" ? "au jeton" : "prix inconnu") : formatEur(l.eur)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line-strong">
                <th scope="row" className="pt-2 text-left font-semibold text-ink">
                  Total
                </th>
                <td className="pt-2 text-right font-mono tabular-nums text-ink-2">{pluriel(devis.images, "image", "images")}</td>
                <td className="whitespace-nowrap pt-2 pl-3 text-right font-mono font-semibold tabular-nums text-ink">
                  {devis.inconnus === 0
                    ? formatEur(devis.montantConfirmationEur)
                    : devis.totalConnuEur > 0
                      ? `≥ ${formatEur(devis.montantConfirmationEur)}`
                      : "inconnu"}
                </td>
              </tr>
              <tr>
                <th scope="row" className="pt-1 text-left font-normal text-ink-2">
                  Budget par sac
                </th>
                <td />
                <td className="pt-1 pl-3 text-right font-mono tabular-nums text-ink-2">{formatEur(devis.budgetEur)}</td>
              </tr>
            </tfoot>
          </table>
          <p className="mt-3 text-xs text-ink-3">
            {devis.inconnus === 0 ? `Soit ${formatUsd(devis.totalConnuUsd)} au taux de ${String(devis.tauxEurParUsd).replace(".", ",")} € pour 1 $. ` : ""}
            {serveur ? "Devis recalculé par le serveur avec le budget de ton compte." : "Le serveur recalcule ce devis avant de payer."}
          </p>
        </>
      )}
    </AlertDialog>
  );
}
