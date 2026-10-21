"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, RefreshCw, Search, Sparkles, Star } from "lucide-react";
import Loader from "@/components/Loader";
import type { EtatCatalogue } from "@/lib/studioCatalogue";
import {
  RATIO_STUDIO,
  SEUIL_CONFIRMATION_USD,
  devisLancement,
  estimerEssai,
  formatUsd,
  libelleTarif,
  type Devis,
  type ModeleImage,
} from "@/lib/studioModeles";
import { Badge, btn, btnAcc, champ } from "../_ui";

// Sélecteur des modèles d'image d'une ligne d'angle : favoris, catalogue
// filtrable, devis, bouton « Générer » et encadré de confirmation.
//
// ⚠️ Composant client : `lib/studioModeles` est isomorphe (valeurs permises),
// `lib/studioCatalogue` est `server-only` (type seulement).

/** = MAX_MODELES_PAR_LANCEMENT de lib/studioLancement (server-only, donc recopié ici). */
export const MAX_MODELES = 6;

/** Le seuil, écrit comme un prix : « 0,10 $ ». */
export const SEUIL_TEXTE = `${SEUIL_CONFIRMATION_USD.toFixed(2).replace(".", ",")} $`;

export type CatalogueClient = { modeles: ModeleImage[]; etat: EtatCatalogue; fetchedAt: string | null };

/** Ce que la fiche partage avec chaque ligne d'angle : le catalogue, chargé une fois, et les favoris. */
export type ContexteModeles = {
  /** null tant que le catalogue n'est pas arrivé (ou si son chargement a échoué). */
  catalogue: CatalogueClient | null;
  chargement: boolean;
  erreur: string | null;
  recharger: () => void;
  favoris: string[];
  /** Favoris dont l'enregistrement est en cours : leur étoile attend la réponse. */
  favorisEnCours: string[];
  basculerFavori: (id: string) => void;
};

/**
 * Références comptées dans l'estimation d'UN essai : celles que le serveur
 * enverra (tronquées au maximum du modèle), plus l'image ratée d'une correction,
 * qui prend une place de référence.
 */
export function referencesEstimees(m: Pick<ModeleImage, "maxReferences">, nbReferences: number, avecImageRatee: boolean): number {
  const n = Math.max(nbReferences, 0);
  if (!avecImageRatee) return Math.min(n, m.maxReferences);
  return Math.min(n, Math.max(m.maxReferences - 1, 0)) + 1;
}

/** Le devis d'un lancement tel que l'écran le voit ; le serveur recalcule le sien avant de payer. */
export function devisPour(modeles: ModeleImage[], nbReferences: number, avecImageRatee = false): Devis {
  return devisLancement(modeles.map((m) => estimerEssai(m, referencesEstimees(m, nbReferences, avecImageRatee))));
}

const tarifsInconnus = (n: number) => `${n} tarif${n > 1 ? "s" : ""} inconnu${n > 1 ? "s" : ""}`;

/** « 0,037 $ » | « 0,020 $ + 1 tarif inconnu » | « inconnu (2 tarifs inconnus) ». */
export function montantDevis(d: Devis): string {
  if (d.inconnus === 0) return formatUsd(d.totalConnuUsd);
  if (d.inconnus === d.lignes.length) return `inconnu (${tarifsInconnus(d.inconnus)})`;
  return `${formatUsd(d.totalConnuUsd)} + ${tarifsInconnus(d.inconnus)}`;
}

function phraseConfirmation(d: Devis, correction: boolean): string {
  const sujet = correction ? "Cette correction" : "Ce lancement";
  if (d.inconnus === d.lignes.length) {
    return `Le coût de ${correction ? "cette correction" : "ce lancement"} est inconnu (${tarifsInconnus(d.inconnus)}) : confirmer ?`;
  }
  const plus = d.inconnus > 0 ? ` (plus ${tarifsInconnus(d.inconnus)})` : "";
  return `${sujet} est estimé${correction ? "e" : ""} à ${formatUsd(d.totalConnuUsd)}${plus} : confirmer ?`;
}

const RAISONS: Record<string, string> = { jeton: "tarif au jeton", inconnu: "tarif inconnu" };

/**
 * Encadré de confirmation, au-delà du seuil ou dès qu'un tarif est inconnu.
 * Le même sert au lancement et à la régénération d'une correction.
 */
export function ConfirmationLancement({
  devis,
  serveur,
  correction = false,
  nomDe,
  onConfirmer,
  onAnnuler,
}: {
  devis: Devis;
  /** Devis renvoyé par le serveur (409) : il a recalculé autre chose que l'écran. */
  serveur: boolean;
  correction?: boolean;
  nomDe: (id: string) => string;
  onConfirmer: () => void;
  onAnnuler: () => void;
}) {
  const auJeton = devis.lignes.some((l) => l.raison === "jeton");
  return (
    <div
      role="alertdialog"
      aria-label="Confirmer la dépense"
      className="mt-2 rounded-lg border border-warn bg-warn-soft p-3 text-sm text-ink"
    >
      <p className="font-semibold">{phraseConfirmation(devis, correction)}</p>
      {serveur && <p className="mt-1 text-sm text-ink-2">Devis recalculé par le serveur, différent de celui affiché.</p>}
      <ul className="mt-2 flex flex-col gap-0.5 font-mono text-xs text-ink-2">
        {devis.lignes.map((l) => (
          <li key={l.modele} className="flex justify-between gap-3">
            <span className="min-w-0 truncate" title={l.modele}>
              {nomDe(l.modele)}
            </span>
            <span className="flex-none">{l.usd !== null ? formatUsd(l.usd) : RAISONS[l.raison] ?? "tarif inconnu"}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-ink-2">
        Confirmation demandée au-delà de {SEUIL_TEXTE} ou dès qu’un tarif est inconnu
        {auJeton ? " ; au jeton, le coût réel n’est connu qu’après la génération." : "."}
      </p>
      <div className="mt-2.5 flex gap-2">
        <button type="button" className={btnAcc} onClick={onConfirmer}>
          <Sparkles size={14} /> Confirmer et générer
        </button>
        {/* Le focus va sur « Annuler » : Entrée ne doit jamais dépenser par réflexe. */}
        {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
        <button type="button" className={btn} onClick={onAnnuler} autoFocus>
          Annuler
        </button>
      </div>
    </div>
  );
}

function LigneModele({
  m,
  coche,
  plein,
  favori,
  favoriEnCours,
  nbReferences,
  onCocher,
  onEtoile,
}: {
  m: ModeleImage;
  coche: boolean;
  /** Le lancement compte déjà MAX_MODELES modèles : on ne peut plus en cocher. */
  plein: boolean;
  favori: boolean;
  favoriEnCours: boolean;
  nbReferences: number;
  onCocher: (coche: boolean) => void;
  onEtoile: () => void;
}) {
  const sansRatio = !m.ratios?.includes(RATIO_STUDIO);
  const tropPeu = nbReferences > 0 && nbReferences < m.minReferences;
  const titre = [m.id, m.description.slice(0, 280)].filter(Boolean).join("\n");
  return (
    <li className="flex min-h-9 items-center gap-2 rounded-md pl-0.5 pr-2 hover:bg-surface-2">
      <button
        type="button"
        onClick={onEtoile}
        disabled={favoriEnCours}
        aria-pressed={favori}
        aria-label={favori ? `Retirer ${m.nom} des favoris` : `Épingler ${m.nom} en favori`}
        title={favori ? "Retirer des favoris" : "Épingler en favori"}
        className={`grid h-8 w-8 flex-none place-items-center rounded-md transition-colors hover:text-ink disabled:opacity-50 ${favori ? "text-accent-text" : "text-ink-3"}`}
      >
        <Star size={15} fill={favori ? "currentColor" : "none"} />
      </button>
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2" title={titre}>
        <input
          type="checkbox"
          className="h-4 w-4 flex-none accent-accent"
          checked={coche}
          disabled={(!coche && plein) || tropPeu}
          onChange={(e) => onCocher(e.target.checked)}
        />
        <span className="min-w-0 truncate text-sm font-semibold text-ink">{m.nom}</span>
      </label>
      {sansRatio && (
        <Badge
          ton="warn"
          title={
            m.ratios
              ? `Formats proposés : ${m.ratios.join(", ")}. Le 3:4 ne sera pas demandé.`
              : "Ce modèle ne publie aucun format : le 3:4 ne sera pas demandé."
          }
        >
          PAS DE 3:4
        </Badge>
      )}
      {tropPeu && <Badge ton="warn">EXIGE {m.minReferences} RÉF.</Badge>}
      <span className="flex-none whitespace-nowrap font-mono text-xs text-ink-2">{libelleTarif(m.tarif)}</span>
      <span className="w-[104px] flex-none whitespace-nowrap text-right font-mono text-xs text-ink-3">jusqu’à {m.maxReferences} réf.</span>
    </li>
  );
}

export default function SelecteurModeles({
  contexte,
  nbReferences,
  coches,
  onCoches,
  bloque,
  enCours,
  onGenerer,
  confirmation,
}: {
  contexte: ContexteModeles;
  /** Vraies photos que l'angle joindrait (avant troncature au maximum de chaque modèle). */
  nbReferences: number;
  coches: string[];
  onCoches: (ids: string[]) => void;
  /** Raison qui empêche de générer (pas de référence, détails non enregistrés), ou null. */
  bloque: string | null;
  /** Une génération tourne déjà sur cet angle. */
  enCours: boolean;
  onGenerer: () => void;
  /** Encadré de confirmation à afficher sous le devis, ou null. */
  confirmation: ReactNode;
}) {
  const { catalogue, chargement, erreur, recharger, favoris, favorisEnCours, basculerFavori } = contexte;
  const [ouvert, setOuvert] = useState<boolean | null>(null);
  const [filtre, setFiltre] = useState("");

  const modeles = useMemo(() => catalogue?.modeles ?? [], [catalogue]);
  const ids = useMemo(() => new Set(modeles.map((m) => m.id)), [modeles]);
  const favorisSet = new Set(favoris);
  const cochesSet = new Set(coches);

  const enFavori = modeles.filter((m) => favorisSet.has(m.id));
  const favorisAbsents = favoris.filter((id) => !ids.has(id));
  const reste = modeles.filter((m) => !favorisSet.has(m.id));
  // Replié par défaut dès qu'il y a des favoris ; déplié quand il n'y en a aucun.
  const deplie = ouvert ?? favoris.length === 0;
  const q = filtre.trim().toLowerCase();
  const resteFiltre = q ? reste.filter((m) => m.nom.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)) : reste;
  // Replié, un modèle coché du reste reste visible : on ne paie pas un modèle qu'on ne voit pas.
  const resteVisible = deplie ? resteFiltre : reste.filter((m) => cochesSet.has(m.id));

  const choisis = modeles.filter((m) => cochesSet.has(m.id));
  const plein = choisis.length >= MAX_MODELES;
  const devis = devisPour(choisis, nbReferences);

  function cocher(id: string, oui: boolean) {
    const sans = coches.filter((x) => x !== id && ids.has(x));
    onCoches(oui ? [...sans, id] : sans);
  }

  const ligne = (m: ModeleImage) => (
    <LigneModele
      key={m.id}
      m={m}
      coche={cochesSet.has(m.id)}
      plein={plein}
      favori={favorisSet.has(m.id)}
      favoriEnCours={favorisEnCours.includes(m.id)}
      nbReferences={nbReferences}
      onCocher={(oui) => cocher(m.id, oui)}
      onEtoile={() => {
        // Le premier favori ne doit pas replier la liste sous le curseur : on fige l'état affiché.
        if (ouvert === null) setOuvert(deplie);
        basculerFavori(m.id);
      }}
    />
  );

  const etat = catalogue?.etat;
  const aside =
    etat?.kind === "stale"
      ? `CATALOGUE DE ${new Date(etat.fetchedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`
      : catalogue
        ? `${modeles.length} MODÈLE${modeles.length > 1 ? "S" : ""} OPENROUTER`
        : null;

  return (
    <div className="rounded-md border border-line p-3">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="font-mono text-xs tracking-[0.2em] text-ink-3">GÉNÉRER PAR API</span>
        {aside && <span className="font-mono text-xs text-ink-3">{aside}</span>}
      </div>

      {chargement && !catalogue ? (
        <Loader size="sm" label="Catalogue OpenRouter…" />
      ) : !catalogue || modeles.length === 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-semibold text-warn">
            {erreur
              ? `Catalogue OpenRouter indisponible (${erreur}).`
              : "Catalogue OpenRouter injoignable : aucun modèle à proposer pour l’instant."}{" "}
            Le dépôt manuel reste possible.
          </p>
          <button type="button" className={btn} onClick={recharger} disabled={chargement}>
            <RefreshCw size={14} /> Réessayer
          </button>
        </div>
      ) : (
        <>
          {etat?.kind === "stale" && (
            <p className="mb-2 text-xs text-ink-2">OpenRouter ne répond pas : liste et tarifs du dernier relevé.</p>
          )}

          <div className="font-mono text-xs tracking-[0.1em] text-ink-3">FAVORIS</div>
          {enFavori.length === 0 && favorisAbsents.length === 0 ? (
            <p className="py-1.5 text-sm text-ink-2">Aucun favori : clique l’étoile d’un modèle pour l’épingler ici.</p>
          ) : (
            <ul className="flex flex-col">
              {enFavori.map(ligne)}
              {favorisAbsents.map((id) => (
                <li key={id} className="flex min-h-9 items-center gap-2 pl-0.5 pr-2 text-sm text-ink-2">
                  <button
                    type="button"
                    onClick={() => basculerFavori(id)}
                    disabled={favorisEnCours.includes(id)}
                    aria-pressed
                    aria-label={`Retirer ${id} des favoris`}
                    className="grid h-8 w-8 flex-none place-items-center rounded-md text-accent-text disabled:opacity-50"
                  >
                    <Star size={15} fill="currentColor" />
                  </button>
                  <span className="min-w-0 truncate font-mono">{id}</span>
                  <span>— absent du catalogue</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-2 border-t border-line pt-2">
            <button
              type="button"
              onClick={() => setOuvert(!deplie)}
              aria-expanded={deplie}
              className="flex h-8 items-center gap-1 font-mono text-xs tracking-[0.1em] text-ink-3 hover:text-ink"
            >
              {deplie ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              TOUS LES MODÈLES ({reste.length})
            </button>
            {deplie && (
              <div className="relative mb-1.5 mt-1">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden="true" />
                <input
                  type="search"
                  value={filtre}
                  onChange={(e) => setFiltre(e.target.value)}
                  placeholder="Filtrer par nom ou identifiant"
                  aria-label="Filtrer les modèles"
                  className={`${champ} h-9 pl-8`}
                />
              </div>
            )}
            {resteVisible.length > 0 && (
              <ul className={`flex flex-col ${deplie ? "max-h-[264px] overflow-y-auto" : ""}`}>{resteVisible.map(ligne)}</ul>
            )}
            {deplie && q && resteFiltre.length === 0 && (
              <p className="py-1.5 text-sm text-ink-2">Aucun modèle ne correspond à « {filtre.trim()} ».</p>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-3">
            <button
              type="button"
              className={btnAcc}
              onClick={onGenerer}
              disabled={choisis.length === 0 || !!bloque || enCours || !!confirmation}
            >
              <Sparkles size={14} /> {enCours ? "Génération en cours…" : `Générer (${choisis.length})`}
            </button>
            {choisis.length > 0 ? (
              <span className="text-sm text-ink">
                Devis : <strong className="font-mono">{montantDevis(devis)}</strong>
                {devis.confirmationRequise && <span className="text-ink-2"> · confirmation demandée</span>}
              </span>
            ) : (
              <span className="text-sm text-ink-2">Coche un ou plusieurs modèles ({MAX_MODELES} au plus).</span>
            )}
            {plein && <span className="text-sm text-ink-2">{MAX_MODELES} modèles au plus par lancement.</span>}
            {bloque && <span className="text-sm font-semibold text-warn">{bloque}</span>}
          </div>
          {confirmation}
        </>
      )}
    </div>
  );
}
