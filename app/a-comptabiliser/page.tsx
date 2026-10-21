"use client";

import { useMemo, useState } from "react";
import { Check, RotateCw, Trash2 } from "lucide-react";
import {
  useArticles,
  useDashboard,
  useDeleteArticle,
  useUpdateArticle,
} from "@/lib/hooks";
import { euros, naturalSort, STATUT_A_COMPTABILISER } from "@/lib/calc";
import Loader from "@/components/Loader";
import type { ArticleDTO } from "@/lib/types";
import { FenetreVente } from "@/components/metier/FenetreVente";
import StatutBadge from "@/components/StatutBadge";
import { CardTitle, Frame, Module } from "@/components/console";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Table, TableDefilante, TBody, TD, TH, THead, TR } from "@/components/ui/table";

/**
 * Module de tête. La maquette remplit d'accent celui qui porte le nombre
 * d'articles en attente — c'est la seule valeur sur laquelle on agit, les
 * deux autres ne font que situer.
 */
function Tete({
  label,
  children,
  accent = false,
}: {
  label: string;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-lg p-5 ${
        accent
          ? "bg-accent text-accent-ink"
          : "border border-line bg-surface"
      }`}
    >
      <div
        className={`font-mono text-xs uppercase tracking-[0.16em] ${
          accent ? "opacity-70" : "text-ink-3"
        }`}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

export default function AComptabiliserPage() {
  const { data: articles = [], isLoading, isError, error } = useArticles({
    statut: STATUT_A_COMPTABILISER,
  });
  const { data: dashboard } = useDashboard();
  // Tri naturel des SKU (l'API ne trie plus côté serveur).
  const sorted = useMemo(
    () => [...articles].sort((a, b) => naturalSort(a.sku, b.sku)),
    [articles],
  );
  const remettreEnStock = useUpdateArticle();
  const supprimer = useDeleteArticle();
  const [target, setTarget] = useState<ArticleDTO | null>(null);
  const [toDelete, setToDelete] = useState<ArticleDTO | null>(null);

  // A fresh confirmation: no error left over from a previous attempt.
  const demanderSuppression = (a: ArticleDTO) => {
    supprimer.reset();
    setToDelete(a);
  };

  const confirmDelete = () => {
    if (!toDelete) return;
    supprimer.mutate(toDelete.id, { onSuccess: () => setToDelete(null) });
  };

  // Rendus deux fois (carte mobile, ligne de tableau) : une seule définition.
  const remettre = (a: ArticleDTO) =>
    remettreEnStock.mutate({ id: a.id, patch: { statut: "En stock" } });
  const remiseEnCours = (a: ArticleDTO) =>
    remettreEnStock.isPending && remettreEnStock.variables?.id === a.id;

  const showEmpty = !isLoading && !isError && articles.length === 0;

  return (
    <Frame>
      {/* Le titre et le kicker « VENTES EN ATTENTE » sont posés par la TopBar. */}
      <section className="grid grid-cols-1 gap-3.5 min-[900px]:grid-cols-3">
        <Tete label="Ventes en attente" accent>
          <div className="mt-2 text-2xl font-bold tabular-nums">
            {articles.length}
          </div>
        </Tete>
        <Tete label="Ventes comptabilisées">
          <div className="mt-2 text-2xl font-bold tabular-nums">
            {dashboard ? dashboard.vendus.toLocaleString("fr-FR") : "—"}
          </div>
        </Tete>
        <Tete label="Synchro">
          <div className="mt-3 flex items-center gap-2.5">
            <span className="inline-block h-[9px] w-[9px] flex-none rounded-full bg-pos" />
            <span className="text-md font-semibold">Temps réel</span>
          </div>
          <div className="mt-1.5 font-mono text-xs uppercase tracking-[0.1em] text-ink-3">
            Trello · étiquette « à comptabiliser »
          </div>
        </Tete>
      </section>

      {/* Empty state (synchro auto, pas de bouton) */}
      {showEmpty && (
        <div className="rounded-lg border border-line bg-surface px-8 py-[70px] text-center">
          <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-accent-soft shadow-pop motion-safe:animate-pop">
            <Check aria-hidden className="h-12 w-12 text-accent-text" strokeWidth={2.6} />
          </div>
          <h2 className="text-xl font-bold tracking-[-0.02em] text-ink">
            Tout est à jour !
          </h2>
          <p className="mx-auto mt-2.5 max-w-[400px] text-base font-medium leading-[1.55] text-ink-3">
            Aucune vente n’attend d’être comptabilisée. Les nouvelles ventes
            apparaissent ici automatiquement dès leur synchronisation.
          </p>
        </div>
      )}

      {/* États chargement / erreur */}
      {isLoading && <Loader />}
      {isError && (
        <div className="rounded-lg border border-line bg-surface px-6 py-10 text-center font-mono text-xs text-neg">
          {(error as Error).message}
        </div>
      )}

      {/* Liste (s'il y a des éléments en attente) */}
      {!isLoading && !isError && articles.length > 0 && (
        <>
          {/* Vue cartes mobile (< md) */}
          <div className="space-y-3 md:hidden">
            {sorted.map((a) => (
              <div
                key={a.id}
                className="rounded-lg border border-line bg-surface p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-sm font-bold text-ink">
                    {a.sku}
                  </span>
                  <StatutBadge statut={a.statut} />
                </div>
                <dl className="mt-3 space-y-1.5 text-base">
                  <div className="flex justify-between gap-2">
                    <dt className="text-ink-3">Marque</dt>
                    <dd className="text-ink">{a.marque}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-ink-3">Catégorie</dt>
                    <dd className="text-ink-3">{a.categorie}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-ink-3">Prix achat</dt>
                    <dd className="text-ink">{euros(a.prixAchat)}</dd>
                  </div>
                </dl>
                <div className="mt-4 flex flex-col gap-2">
                  <Button size="lg" className="w-full" onClick={() => setTarget(a)}>
                    Valider
                  </Button>
                  <Button
                    variant="secondary"
                    size="lg"
                    className="w-full text-accent-text"
                    pending={remiseEnCours(a)}
                    onClick={() => remettre(a)}
                  >
                    <RotateCw aria-hidden className="h-4 w-4" strokeWidth={2} />
                    Remettre en stock
                  </Button>
                  <Button
                    variant="secondary"
                    size="lg"
                    className="w-full text-neg hover:border-neg"
                    onClick={() => demanderSuppression(a)}
                  >
                    <Trash2 aria-hidden className="h-4 w-4" strokeWidth={2} />
                    Supprimer
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Tableau (≥ md) */}
          <Module className="hidden overflow-hidden md:block">
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 pb-3 pt-[18px]">
              <CardTitle className="">File d&apos;attente comptable</CardTitle>
              <span className="font-mono text-xs uppercase tracking-[0.1em] text-ink-3">
                {articles.length} EN ATTENTE
              </span>
            </div>
            <TableDefilante>
              <Table className="min-w-[900px] text-base">
                <THead>
                  <TR>
                    <TH className="px-[22px] py-[15px] font-mono font-medium tracking-[0.14em]">SKU</TH>
                    <TH className="py-[15px] font-mono font-medium tracking-[0.14em]">Marque</TH>
                    <TH className="py-[15px] font-mono font-medium tracking-[0.14em]">Catégorie</TH>
                    <TH className="py-[15px] text-right font-mono font-medium tracking-[0.14em]">Prix achat</TH>
                    <TH className="py-[15px] font-mono font-medium tracking-[0.14em]">Transporteur</TH>
                    <TH className="py-[15px] text-right font-mono font-medium tracking-[0.14em]">Prix vente</TH>
                    <TH className="py-[15px] font-mono font-medium tracking-[0.14em]">Date vente</TH>
                    <TH className="px-[22px] py-[15px] text-right font-mono font-medium tracking-[0.14em]">Actions</TH>
                  </TR>
                </THead>
                <TBody>
                  {sorted.map((a) => (
                    <TR key={a.id} className="border-bg transition-colors duration-fast hover:bg-surface-2">
                      <TD className="px-[22px] py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-bold text-ink">
                            {a.sku}
                          </span>
                          <StatutBadge statut={a.statut} />
                        </div>
                      </TD>
                      <TD className="py-3.5 text-ink-2">{a.marque}</TD>
                      <TD className="py-3.5 text-ink-3">{a.categorie}</TD>
                      <TD className="py-3.5 text-right text-ink-2">
                        {euros(a.prixAchat)}
                      </TD>
                      <TD className="py-3.5 text-ink-3">
                        {a.transporteur ?? "—"}
                      </TD>
                      <TD className="py-3.5 text-right text-ink-3">
                        {a.prixVente != null ? euros(a.prixVente) : "—"}
                      </TD>
                      <TD className="py-3.5 text-ink-3">
                        {a.dateVente
                          ? new Date(a.dateVente).toLocaleDateString("fr-FR")
                          : "—"}
                      </TD>
                      <TD className="px-[22px] py-3.5">
                        <div className="flex items-center justify-end gap-2">
                          <Button size="sm" onClick={() => setTarget(a)}>
                            Valider
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="text-accent-text"
                            pending={remiseEnCours(a)}
                            onClick={() => remettre(a)}
                          >
                            <RotateCw aria-hidden className="h-3.5 w-3.5" strokeWidth={2} />
                            Remettre en stock
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="text-neg hover:border-neg"
                            onClick={() => demanderSuppression(a)}
                          >
                            <Trash2 aria-hidden className="h-3.5 w-3.5" strokeWidth={2} />
                            Supprimer
                          </Button>
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableDefilante>
          </Module>
        </>
      )}

      <FenetreVente article={target} contexte="comptabiliser" onClose={() => setTarget(null)} />

      <AlertDialog
        open={!!toDelete}
        onOpenChange={(ouvert) => {
          if (!ouvert) setToDelete(null);
        }}
        title={`Supprimer ${toDelete?.sku ?? ""} ?`}
        description={
          <>
            L’article et sa vente en attente seront supprimés définitivement.
            {supprimer.isError ? (
              <span role="alert" className="mt-3 block font-mono text-xs text-neg">
                {(supprimer.error as Error).message}
              </span>
            ) : null}
          </>
        }
        confirmLabel={`Supprimer ${toDelete?.sku ?? ""}`}
        pending={supprimer.isPending}
        pendingLabel="Suppression…"
        onConfirm={confirmDelete}
      />
    </Frame>
  );
}
