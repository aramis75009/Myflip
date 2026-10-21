"use client";

import {
  forwardRef,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  useWindowVirtualizer,
  type Virtualizer,
} from "@tanstack/react-virtual";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArticlePatch,
  useArticles,
  useBulkUpdateStatus,
  useCommandes,
  useDeleteArticle,
  useUpdateArticle,
} from "@/lib/hooks";
import { coef, euros, naturalSort, STATUT_VENDU, STATUTS } from "@/lib/calc";
import StatutPill from "@/components/StatutPill";
import { CANAUX } from "@/lib/canalColors";
import { styleStatut } from "@/lib/statutColors";
import type { ArticleDTO } from "@/lib/types";
import EditableCell from "@/components/EditableCell";
import { COMPTES_VENTE, isCompteVente, labelCompteVente } from "@/lib/comptesVente";
import { joursEnVente, jourParis } from "@/lib/dateMiseEnVente";
import { FenetreVente } from "@/components/metier/FenetreVente";
import NewCommandeModal from "@/components/NewCommandeModal";
import CanalBadge from "@/components/CanalBadge";
import StatutBadge from "@/components/StatutBadge";
import Loader from "@/components/Loader";
import { toast } from "sonner";
import {
  Plus,
  Download,
  SlidersHorizontal,
  Search,
  FileText,
  X,
} from "lucide-react";
import { Frame } from "@/components/console";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { BarreActions } from "@/components/ui/barre-actions";
import { Button, IconButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { ColonneActions, Table, TBody, TH, THead } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { cibleSelection, libelleSelection } from "./_selection";
import {
  messageChangementGroupe,
  messageQuitterVendu,
  messageSuppression,
  type Confirmation,
} from "./_confirmations";

type SortKey =
  | "sku"
  | "marque"
  | "categorie"
  | "grade"
  | "statut"
  | "prixAchat"
  | "prixVente"
  | "margeBrute"
  | "margeNette"
  | "coefficient"
  | "dateMiseEnVente"
  | "dateVente"
  | "joursEnVente"
  | "canal"
  | "compteVente"
  | "transporteur";

type ColumnMeta = {
  key: SortKey;
  label: string;
  align?: "right";
  always?: boolean; // colonne non masquable
  defaultVisible: boolean;
};

const COLUMN_META: ColumnMeta[] = [
  { key: "sku", label: "SKU", always: true, defaultVisible: true },
  { key: "marque", label: "Marque", defaultVisible: true },
  { key: "categorie", label: "Catégorie", defaultVisible: true },
  { key: "grade", label: "Grade", defaultVisible: false },
  { key: "statut", label: "Statut", defaultVisible: true },
  { key: "prixAchat", label: "Prix achat", align: "right", defaultVisible: true },
  { key: "prixVente", label: "Prix vente", align: "right", defaultVisible: false },
  { key: "margeBrute", label: "Marge brute", align: "right", defaultVisible: false },
  { key: "margeNette", label: "Marge nette", align: "right", defaultVisible: true },
  { key: "coefficient", label: "Coef", align: "right", defaultVisible: true },
  { key: "dateMiseEnVente", label: "Mis en vente le", defaultVisible: true },
  { key: "dateVente", label: "Vendu le", defaultVisible: true },
  { key: "joursEnVente", label: "Jours en vente", align: "right", defaultVisible: true },
  { key: "canal", label: "Canal", defaultVisible: true },
  { key: "compteVente", label: "Compte", defaultVisible: true },
  { key: "transporteur", label: "Transporteur", defaultVisible: false },
];

const COLUMN_STORAGE_KEY = "myflip-columns";

const COMPTES_OPTIONS = COMPTES_VENTE.map((c) => ({ value: c.id, label: c.label }));

const joursTxt = (n: number) => (n <= 1 ? n + " jour" : n + " jours");

// Chips de filtre par statut : « Tous » puis un chip par statut connu.
const STATUT_CHIPS: { label: string; value: string }[] = [
  { label: "Tous", value: "" },
  ...STATUTS.map((s) => ({ label: s, value: s })),
];

const defaultColumnVisibility = (): Record<string, boolean> =>
  Object.fromEntries(COLUMN_META.map((c) => [c.key, c.defaultVisible]));

// Extracteurs de valeur pour l'export CSV (une fonction par colonne).
const CSV_VALUE: Record<SortKey, (a: ArticleDTO) => string | number> = {
  sku: (a) => a.sku,
  marque: (a) => a.marque,
  categorie: (a) => a.categorie,
  grade: (a) => a.grade ?? "",
  statut: (a) => a.statut,
  prixAchat: (a) => a.prixAchat,
  prixVente: (a) => a.prixVente ?? "",
  margeBrute: (a) => a.margeBrute ?? "",
  margeNette: (a) => a.margeNette ?? "",
  coefficient: (a) => a.coefficient ?? "",
  dateMiseEnVente: (a) =>
    a.dateMiseEnVente ? new Date(a.dateMiseEnVente).toLocaleDateString("fr-FR") : "",
  dateVente: (a) =>
    a.dateVente ? new Date(a.dateVente).toLocaleDateString("fr-FR") : "",
  joursEnVente: (a) => joursEnVente(a)?.jours ?? "",
  canal: (a) => a.canal ?? "",
  compteVente: (a) => (a.compteVente ? labelCompteVente(a.compteVente) : ""),
  transporteur: (a) => a.transporteur ?? "",
};

/**
 * Fenêtre visible d'un virtualizer + les deux cales qui la maintiennent à sa
 * place dans le flux (une ligne de tableau en desktop, un div en mobile).
 * `scrollMargin` compense le décalage entre le haut de la fenêtre et le haut de
 * la liste — sans lui, la liste se décale de la hauteur des KPI et des filtres.
 */
function virtualWindow(v: Virtualizer<Window, Element>) {
  const items = v.getVirtualItems();
  if (items.length === 0) return { items, padTop: 0, padBottom: 0 };
  const margin = v.options.scrollMargin;
  return {
    items,
    padTop: items[0].start - margin,
    padBottom: v.getTotalSize() - (items[items.length - 1].end - margin),
  };
}

/**
 * Height of a desktop table row, in px (PRD § 10). Written on every <tr> AND
 * given to the row virtualiser as its size, so the virtual height always
 * equals the rendered one: rows are not measured, they cannot drift.
 *
 * It must stay ≥ the tallest cell, all single-line (rows are
 * `whitespace-nowrap`): an EditableCell in 13 px text (line 1.45 → 18.85)
 * + its 2 × 4 px + the cell's 2 × 9 px + the 1 px rule ≈ 45.85; the status
 * pill 32 + 2 × 6 + 1 = 45; the action buttons 32 + 2 × 6 + 1 = 45. Change
 * a cell padding, a control height or a text size → recompute.
 */
const HAUTEUR_LIGNE_PX = 46;

/**
 * Height of a mobile card, in px: the estimate of the card virtualiser
 * (cards are measured, their price line may wrap). Single-line card: 12 gap
 * + 2 border + 32 padding + 3 lines × 18.85 + 6 + 8 + actions (12 + 1 + 12
 * + 44) ≈ 185.55.
 */
const HAUTEUR_CARTE_PX = 186;

// « Jours en vente » n'est pas un champ de l'article : il se calcule.
const sortValue = (a: ArticleDTO, key: SortKey) =>
  key === "joursEnVente" ? (joursEnVente(a)?.jours ?? null) : a[key];

function compare(a: ArticleDTO, b: ArticleDTO, key: SortKey): number {
  const va = sortValue(a, key);
  const vb = sortValue(b, key);
  if (va == null && vb == null) return 0;
  if (va == null) return 1;
  if (vb == null) return -1;
  if (typeof va === "number" && typeof vb === "number") return va - vb;
  // Tri naturel pour les colonnes texte (SKU : AD1, AD2…AD10).
  return naturalSort(String(va), String(vb));
}

// ── Vocabulaire visuel « Console » ──────────────────────────────────────
// Toute la barre d'outils est en pastilles de 40px posées sur le fond creusé
// (--tint) du module : les contrôles se lisent comme un bloc unique, et rien
// ne concurrence le tableau. Ces trois constantes sont la seule source de
// vérité de cette hauteur — les modifier déplace toute la barre d'un coup.
// 44px en mobile (cible tactile Apple HIG), 40px en desktop (maquette C).
const CTRL =
  "h-11 md:h-10 rounded-full border border-line bg-surface-2 text-sm text-ink-2 transition-colors duration-fast hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";
const CTRL_SELECT = `${CTRL} max-w-[220px] cursor-pointer truncate px-3.5 font-semibold`;
const CTRL_BTN = `${CTRL} inline-flex items-center gap-2 px-4 font-semibold`;

// Micro-label en capitales monospacées : en-têtes de colonnes et libellés de
// KPI. C'est le marqueur typographique de la direction — jamais utilisé pour
// du contenu, uniquement pour nommer une donnée.
const MICRO =
  "font-mono text-xs font-medium uppercase tracking-[0.14em] text-ink-3";

// Couleur de la marge nette. Le zéro et l'absence de valeur se lisent pareil :
// il n'y a rien à saluer ni à alarmer.
//
// UNE seule fonction pour les deux vues. Il y en avait deux, avec deux palettes
// différentes (la ligne de tableau via les alias Tailwind, la carte mobile via
// les variables) et deux comportements différents sur le zéro : la version
// tableau le colorait en vert, contredisant le commentaire ci-dessus. La même
// marge se lisait donc « neutre » sur mobile et « positive » sur desktop.
function margeClass(marge: number | null): string {
  if (marge == null || marge === 0) return "text-ink-3";
  return marge < 0 ? "text-neg" : "text-pos";
}

// Détecte le breakpoint md (768px) pour ne rendre qu'une seule liste virtualisée
// à la fois (sinon deux virtualizers tourneraient, dont un sur du DOM masqué).
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isDesktop;
}

/**
 * Sélection à la souris par glissement dans le tableau (desktop).
 *
 * Piloté par `elementFromPoint` + l'attribut `data-index` de chaque ligne, et
 * NON par des `mouseenter` de ligne : la liste est virtualisée (seules ~20
 * lignes montées), donc on remplit la plage [ancre..courant] par INDICE, ce qui
 * couvre aussi les lignes intermédiaires non rendues. Auto-scroll près des bords
 * pour parcourir une longue liste sans lâcher.
 *
 * Renvoie le handler `onPointerDown` à poser sur le conteneur du tableau ; il ne
 * s'active que sur une pression souris démarrée dans une cellule `data-select-cell`.
 */
function useDragSelect(
  sortedRef: React.MutableRefObject<ArticleDTO[]>,
  selectedRef: React.MutableRefObject<Set<string>>,
  setSelected: React.Dispatch<React.SetStateAction<Set<string>>>,
) {
  const drag = useRef<{
    anchor: number;
    mode: "add" | "remove";
    base: Set<string>;
    moved: boolean;
    x: number;
    y: number;
  } | null>(null);
  const raf = useRef<number | null>(null);

  const fns = useRef({
    indexAt(x: number, y: number): number | null {
      const el = document.elementFromPoint(x, y);
      const tr = el?.closest?.("tr[data-index]") as HTMLElement | null;
      if (!tr) return null;
      const i = Number(tr.getAttribute("data-index"));
      return Number.isFinite(i) ? i : null;
    },
    apply(current: number) {
      const d = drag.current;
      if (!d) return;
      const sorted = sortedRef.current;
      const from = Math.min(d.anchor, current);
      const to = Math.max(d.anchor, current);
      const next = new Set(d.base);
      for (let k = from; k <= to; k++) {
        const id = sorted[k]?.id;
        if (!id) continue;
        if (d.mode === "add") next.add(id);
        else next.delete(id);
      }
      setSelected(next);
    },
    tick() {
      const d = drag.current;
      if (!d) {
        raf.current = null;
        return;
      }
      const margin = 80;
      const maxStep = 24;
      const h = window.innerHeight;
      let dy = 0;
      if (d.y < margin) dy = -Math.ceil(((margin - d.y) / margin) * maxStep);
      else if (d.y > h - margin)
        dy = Math.ceil(((d.y - (h - margin)) / margin) * maxStep);
      if (dy !== 0) {
        window.scrollBy(0, dy);
        const i = fns.current.indexAt(d.x, d.y);
        if (i != null) {
          if (i !== d.anchor) d.moved = true;
          fns.current.apply(i);
        }
      }
      raf.current = requestAnimationFrame(fns.current.tick);
    },
    onMove(e: PointerEvent) {
      const d = drag.current;
      if (!d) return;
      d.x = e.clientX;
      d.y = e.clientY;
      const i = fns.current.indexAt(e.clientX, e.clientY);
      if (i != null) {
        if (i !== d.anchor) d.moved = true;
        fns.current.apply(i);
      }
      if (raf.current == null) raf.current = requestAnimationFrame(fns.current.tick);
    },
    onUp() {
      const d = drag.current;
      if (raf.current != null) {
        cancelAnimationFrame(raf.current);
        raf.current = null;
      }
      window.removeEventListener("pointermove", fns.current.onMove);
      window.removeEventListener("pointerup", fns.current.onUp);
      document.body.style.userSelect = "";
      // Un vrai glissement génère un click final : on l'avale pour ne pas ouvrir
      // un détail ni entrer en édition sur la cellule relâchée.
      if (d?.moved) {
        const swallow = (ev: MouseEvent) => {
          ev.stopPropagation();
          ev.preventDefault();
        };
        window.addEventListener("click", swallow, { capture: true, once: true });
        setTimeout(
          () => window.removeEventListener("click", swallow, { capture: true }),
          0,
        );
      }
      drag.current = null;
    },
  });

  useEffect(() => {
    const f = fns.current;
    return () => {
      window.removeEventListener("pointermove", f.onMove);
      window.removeEventListener("pointerup", f.onUp);
      if (raf.current != null) cancelAnimationFrame(raf.current);
      document.body.style.userSelect = "";
    };
  }, []);

  return useCallback((e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const cell = (e.target as HTMLElement).closest("[data-select-cell]");
    if (!cell) return;
    const tr = cell.closest("tr[data-index]") as HTMLElement | null;
    if (!tr) return;
    const anchor = Number(tr.getAttribute("data-index"));
    if (!Number.isFinite(anchor)) return;
    e.preventDefault(); // supprime le toggle natif + la sélection de texte
    const base = new Set(selectedRef.current);
    const id = sortedRef.current[anchor]?.id;
    drag.current = {
      anchor,
      mode: id && base.has(id) ? "remove" : "add",
      base,
      moved: false,
      x: e.clientX,
      y: e.clientY,
    };
    document.body.style.userSelect = "none";
    fns.current.apply(anchor);
    window.addEventListener("pointermove", fns.current.onMove);
    window.addEventListener("pointerup", fns.current.onUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

type RowCallbacks = {
  onToggleSelect: (id: string) => void;
  onPatch: (id: string, patch: ArticlePatch) => void;
  onStatutChange: (a: ArticleDTO, value: string) => void;
  onDelete: (a: ArticleDTO) => void;
  onShowDetail: (a: ArticleDTO) => void;
};

type ArticleRowProps = RowCallbacks & {
  a: ArticleDTO;
  shownColumns: ColumnMeta[];
  isSelected: boolean;
  "data-index"?: number;
};

// Ligne du tableau (desktop). Mémoïsée : avec la virtualisation seules ~20
// lignes existent, et un edit ne re-render que la ligne touchée (props stables).
const ArticleRow = memo(
  forwardRef<HTMLTableRowElement, ArticleRowProps>(function ArticleRow(
    {
      a,
      shownColumns,
      isSelected,
      onToggleSelect,
      onPatch,
      onStatutChange,
      onDelete,
      onShowDetail,
      ...rest
    },
    ref,
  ) {
    const vendu = a.statut === STATUT_VENDU;
    // Coef effectif : pour un article non vendu mais dont le prix de vente est
    // renseigné, on dérive prixVente / prixAchat.
    const coefEffectif =
      a.coefficient ??
      (a.prixVente != null && a.prixAchat ? a.prixVente / a.prixAchat : null);
    const sousObjectif =
      (a.statut === "En vente" || a.statut === "En stock") &&
      a.coefObjectif != null &&
      a.prixVente != null &&
      coefEffectif != null &&
      coefEffectif < a.coefObjectif;
    const jours = joursEnVente(a);
    const cells: Record<SortKey, React.ReactNode> = {
      sku: (
        <td
          key="sku"
          className="py-[9px] pl-2 pr-2 font-mono text-sm font-bold text-ink"
        >
          {/* Filet vertical à la couleur du statut : c'est lui qui rend la
              colonne scannable. Le statut reste lisible en toutes lettres plus
              loin dans la ligne — le filet ne fait que le rendre repérable
              sans lire, en balayant la première colonne du regard. */}
          <span className="flex items-center">
            <span
              aria-hidden="true"
              className={cn("mr-px h-[19px] w-[3px] flex-none rounded-full", styleStatut(a.statut).repere)}
            />
            {/* min-w-0 : sans lui l'input d'édition (w-full) déborderait de la
                largeur du filet, et la troncature du libellé ne prendrait pas. */}
            <span className="min-w-0 flex-1">
              <EditableCell
                value={a.sku}
                champ="SKU"
                sku={a.sku}
                onSave={(v) => onPatch(a.id, { sku: v })}
              />
            </span>
          </span>
        </td>
      ),
      marque: (
        <td key="marque" className="px-2 py-[9px] text-sm font-semibold text-ink">
          <EditableCell
            value={a.marque}
            champ="marque"
            sku={a.sku}
            onSave={(v) => onPatch(a.id, { marque: v })}
          />
        </td>
      ),
      categorie: (
        <td key="categorie" className="px-2 py-[9px] text-sm text-ink-2">
          <EditableCell
            value={a.categorie}
            champ="catégorie"
            sku={a.sku}
            onSave={(v) => onPatch(a.id, { categorie: v })}
          />
        </td>
      ),
      grade: (
        <td key="grade" className="px-2 py-[9px] text-sm text-ink-2">
          <EditableCell
            value={a.grade}
            champ="grade"
            sku={a.sku}
            onSave={(v) => onPatch(a.id, { grade: v || null })}
          />
        </td>
      ),
      // 6px de padding et non 9 : la pastille fait 32px de haut à elle seule,
      // c'est elle qui cale la hauteur de ligne — cf. estimateSize plus bas.
      statut: (
        <td key="statut" className="px-2 py-1.5">
          <StatutPill
            value={a.statut}
            onChange={(s) => onStatutChange(a, s)}
            ariaLabel={`Statut de ${a.sku}`}
          />
        </td>
      ),
      prixAchat: (
        <td
          key="prixAchat"
          className="px-2 py-[9px] font-mono text-sm tabular-nums text-ink"
        >
          <EditableCell
            value={a.prixAchat}
            display={euros(a.prixAchat)}
            type="number"
            align="right"
            champ="prix achat"
            sku={a.sku}
            onSave={(v) => onPatch(a.id, { prixAchat: Number(v) })}
          />
        </td>
      ),
      prixVente: (
        <td
          key="prixVente"
          className="px-2 py-[9px] font-mono text-sm tabular-nums text-ink"
        >
          <EditableCell
            value={a.prixVente}
            display={a.prixVente != null ? euros(a.prixVente) : "—"}
            type="number"
            align="right"
            editable={vendu}
            champ="prix vente"
            sku={a.sku}
            onSave={(v) => onPatch(a.id, { prixVente: Number(v) })}
          />
        </td>
      ),
      margeBrute: (
        <td
          key="margeBrute"
          className="px-3 py-[9px] text-right font-mono text-sm tabular-nums text-ink-2"
        >
          {a.margeBrute != null ? euros(a.margeBrute) : "—"}
        </td>
      ),
      margeNette: (
        <td
          key="margeNette"
          className={`px-3 py-[9px] text-right font-mono text-sm font-medium tabular-nums ${margeClass(
            a.margeNette,
          )}`}
        >
          {a.margeNette != null ? euros(a.margeNette) : "—"}
        </td>
      ),
      coefficient: (
        <td
          key="coefficient"
          className="px-3 py-[9px] text-right font-mono text-sm font-bold tabular-nums"
        >
          {sousObjectif ? (
            <span
              className="inline-flex items-center gap-1 text-warn"
              title={`Objectif : x${a.coefObjectif}`}
            >
              ⚠️ {coef(coefEffectif)}
            </span>
          ) : (
            <span className="text-ink-2">{coef(a.coefficient)}</span>
          )}
        </td>
      ),
      dateMiseEnVente: (
        <td
          key="dateMiseEnVente"
          className="px-2 py-[9px] font-mono text-xs tabular-nums text-ink-2"
        >
          <EditableCell
            value={a.dateMiseEnVente ? jourParis(new Date(a.dateMiseEnVente)) : null}
            display={
              a.dateMiseEnVente
                ? new Date(a.dateMiseEnVente).toLocaleDateString("fr-FR")
                : "—"
            }
            type="date"
            champ="date de mise en vente"
            sku={a.sku}
            onSave={(v) => onPatch(a.id, { dateMiseEnVente: v || null })}
          />
        </td>
      ),
      dateVente: (
        <td
          key="dateVente"
          className="px-2 py-[9px] font-mono text-xs tabular-nums text-ink-2"
        >
          <EditableCell
            value={a.dateVente ? jourParis(new Date(a.dateVente)) : null}
            display={
              a.dateVente
                ? new Date(a.dateVente).toLocaleDateString("fr-FR")
                : "—"
            }
            type="date"
            editable={vendu}
            champ="date de vente"
            sku={a.sku}
            onSave={(v) =>
              onPatch(a.id, {
                dateVente: v ? new Date(v).toISOString() : null,
              })
            }
          />
        </td>
      ),
      // Calculé, non éditable : grisé tant que l'article est en vente (le
      // compteur tourne), plein une fois vendu (durée définitive).
      joursEnVente: (
        <td
          key="joursEnVente"
          className="px-3 py-[9px] text-right font-mono text-sm tabular-nums"
        >
          {jours ? (
            <span
              className={jours.vendu ? "font-bold text-ink" : "text-ink-3"}
              title={jours.vendu ? "Vendu en " + joursTxt(jours.jours) : "En vente depuis " + joursTxt(jours.jours)}
            >
              {jours.jours} j
            </span>
          ) : (
            <span className="text-ink-3">—</span>
          )}
        </td>
      ),
      canal: (
        <td key="canal" className="px-2 py-[9px]">
          <CanalBadge canal={a.canal} />
        </td>
      ),
      // Compte Vinted choisi AVANT la vente : SacBase le lit pour répartir les
      // sacs par compte. Vide = « — », à attribuer.
      compteVente: (
        <td key="compteVente" className="px-2 py-[9px] text-sm text-ink-2">
          <EditableCell
            type="select"
            value={a.compteVente}
            display={a.compteVente ? labelCompteVente(a.compteVente) : undefined}
            options={COMPTES_OPTIONS}
            champ="compte"
            sku={a.sku}
            onSave={(v) => onPatch(a.id, { compteVente: isCompteVente(v) ? v : null })}
          />
        </td>
      ),
      transporteur: (
        <td key="transporteur" className="px-3 py-[9px] text-sm text-ink-2">
          {a.transporteur ?? "—"}
        </td>
      ),
    };
    return (
      <tr
        ref={ref}
        {...rest}
        // Fixed height, the virtualiser's row size (HAUTEUR_LIGNE_PX).
        style={{ height: HAUTEUR_LIGNE_PX }}
        // Le survol ne pose plus de filet à gauche : le filet de statut porté
        // par la colonne SKU occupe déjà ce registre, et deux filets à 40px
        // d'écart brouillaient la lecture. Un simple fond suffit.
        className={cn(
          "group whitespace-nowrap border-b border-line align-middle transition-colors duration-fast hover:bg-surface-2",
          isSelected && "bg-accent-soft",
        )}
      >
        {/* data-select-cell : point d'ancrage du glissement (cf. useDragSelect).
            La case est pointer-events-none → la délégation gère clic ET glissement,
            sans double-toggle ; onChange reste pour l'accessibilité clavier. */}
        <td data-select-cell className="cursor-pointer select-none px-3 py-[9px]">
          <Checkbox
            aria-label={`Sélectionner ${a.sku}`}
            className="pointer-events-none"
            checked={isSelected}
            onChange={() => onToggleSelect(a.id)}
          />
        </td>
        {shownColumns.map((c) => cells[c.key])}
        {/* Stays in view while the table scrolls sideways (ST-14); its
            background follows the row's (hover, selection). 32 px buttons in
            6 px padding: within HAUTEUR_LIGNE_PX. */}
        <ColonneActions
          className={cn("py-1.5 group-hover:bg-surface-2", isSelected && "bg-accent-soft")}
        >
          <div className="flex items-center justify-end gap-1 text-ink-3">
            <IconButton
              label={a.titreAnnonce ? "Voir le détail (annonce générée)" : "Voir le détail"}
              onClick={() => onShowDetail(a)}
              className={cn("md:h-8 md:w-8 hover:text-accent-text", a.titreAnnonce && "text-accent-text")}
            >
              <FileText aria-hidden className="h-4 w-4" strokeWidth={2} />
            </IconButton>
            <IconButton
              label="Supprimer"
              onClick={() => onDelete(a)}
              className="md:h-8 md:w-8 hover:text-neg"
            >
              <X aria-hidden className="h-4 w-4" strokeWidth={2} />
            </IconButton>
          </div>
        </ColonneActions>
      </tr>
    );
  }),
);

type ArticleCardProps = {
  a: ArticleDTO;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onStatutChange: (a: ArticleDTO, value: string) => void;
  onDelete: (a: ArticleDTO) => void;
  onShowDetail: (a: ArticleDTO) => void;
  "data-index"?: number;
};

// Carte (mobile). Le wrapper porte le ref de mesure + le gap (pb-3) pour que la
// hauteur mesurée par le virtualizer inclue l'espacement entre cartes.
const ArticleCard = memo(
  forwardRef<HTMLDivElement, ArticleCardProps>(function ArticleCard(
    { a, isSelected, onToggleSelect, onStatutChange, onDelete, onShowDetail, ...rest },
    ref,
  ) {
    const jours = joursEnVente(a);
    return (
      <div ref={ref} {...rest} className="pb-3">
        <div
          className={`overflow-hidden rounded-lg border bg-surface p-4 ${
            isSelected ? "border-accent" : "border-line"
          }`}
        >
          <div className="flex gap-3">
            <Checkbox
              aria-label={`Sélectionner ${a.sku}`}
              className="mt-1"
              checked={isSelected}
              onChange={() => onToggleSelect(a.id)}
            />
            <div
              className="min-w-0 flex-1 cursor-pointer"
              onClick={() => onShowDetail(a)}
            >
              {/* Même filet de statut que sur la ligne desktop : une carte se
                  reconnaît à son SKU, on lui donne le même point d'entrée. */}
              <div className="flex min-w-0 items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className={cn("h-[17px] w-[3px] flex-none rounded-full", styleStatut(a.statut).repere)}
                />
                <span className="truncate font-mono text-sm font-bold text-ink">
                  {a.sku}
                </span>
                {a.titreAnnonce && (
                  <FileText aria-hidden className="h-4 w-4 text-accent-text" strokeWidth={2} />
                )}
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-ink-2">
                  {a.marque}
                  {a.compteVente && (
                    <span className="font-normal text-ink-3">
                      {" · "}
                      {labelCompteVente(a.compteVente)}
                    </span>
                  )}
                </span>
                <CanalBadge canal={a.canal} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-sm tabular-nums">
                <span className="text-ink-2">{euros(a.prixAchat)}</span>
                <span className="text-ink-3">→</span>
                <span className="text-ink-2">
                  {a.prixVente != null ? euros(a.prixVente) : "—"}
                </span>
                <span className="text-ink-3">·</span>
                <span className={`font-bold ${margeClass(a.margeNette)}`}>
                  {a.margeNette != null ? euros(a.margeNette) : "—"}
                </span>
                {jours && (
                  <span
                    className={jours.vendu ? "text-ink-2" : "text-ink-3"}
                    title={jours.vendu ? "Vendu en " + joursTxt(jours.jours) : "En vente depuis " + joursTxt(jours.jours)}
                  >
                    · {jours.jours} j
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Actions (parité avec les lignes du tableau) — touch targets 44px */}
          <div className="mt-3 flex items-center gap-2 border-t border-bg pt-3">
            <StatutPill
              value={a.statut}
              onChange={(s) => onStatutChange(a, s)}
              size="md"
              ariaLabel={`Statut de ${a.sku}`}
              className="min-w-0 flex-1"
            />
            <IconButton
              label="Voir le détail"
              onClick={() => onShowDetail(a)}
              className={cn(
                "rounded-md border border-line active:bg-surface-2",
                a.titreAnnonce ? "text-accent-text" : "text-ink-3",
              )}
            >
              <FileText aria-hidden className="h-[18px] w-[18px]" strokeWidth={2} />
            </IconButton>
            <IconButton
              label={`Supprimer ${a.sku}`}
              onClick={() => onDelete(a)}
              className="rounded-md border border-line text-ink-3 active:text-neg"
            >
              <X aria-hidden className="h-[18px] w-[18px]" strokeWidth={2} />
            </IconButton>
          </div>
        </div>
      </div>
    );
  }),
);

// Carte de KPI du bandeau de tête.
//
// L'icône a disparu par rapport à la version précédente : à quatre cartes
// côte à côte, elle occupait un tiers de la largeur sans rien dire que le
// libellé ne disait déjà. Le libellé passe donc en micro-capitales mono, et
// le chiffre récupère toute la place — c'est lui qu'on vient chercher.
// `dark` = carte pleine vert forêt, réservée à la valeur du stock.
function KpiCard({
  value,
  label,
  dark,
}: {
  value: string;
  label: string;
  dark?: boolean;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-lg border px-[18px] py-[15px] transition-[transform,box-shadow,border-color] duration-slow hover:-translate-y-[3px] ${
        dark
          ? "border-accent bg-accent text-accent-ink shadow-pop hover:shadow-over"
          : "border-line bg-surface hover:border-line-strong hover:shadow-pop"
      }`}
    >
      {dark && (
        <svg
          width="120" height="120" viewBox="0 0 96 96" fill="none"
          aria-hidden
          className="pointer-events-none absolute -bottom-8 -right-6 opacity-[.08]"
        >
          <path d="M27 69 V31 L48 54 L69 31 V69" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      <div
        className={`font-mono text-xs font-medium uppercase tracking-[0.16em] ${
          dark ? "text-accent-ink" : "text-ink-3"
        }`}
      >
        {label}
      </div>
      <div className="relative mt-1.5 font-sans text-lg font-bold tracking-[-0.03em] tabular-nums md:text-xl">
        {value}
      </div>
    </div>
  );
}

// Case à cocher du rang « Colonnes ». `locked` = colonne non masquable :
// cochée d'office, désactivée, et sans effet au clic.
function ColumnChip({
  label,
  checked,
  locked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  locked?: boolean;
  onToggle?: () => void;
}) {
  return (
    <label
      className={`inline-flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1.5 text-sm ${
        locked
          ? "cursor-default text-ink-3"
          : "cursor-pointer text-ink-2"
      }`}
    >
      <Checkbox
        className="md:h-3.5 md:w-3.5 disabled:cursor-default"
        checked={locked ? true : checked}
        disabled={locked}
        readOnly={locked}
        onChange={locked ? undefined : onToggle}
      />
      {label}
    </label>
  );
}

function StockInner() {
  const router = useRouter();
  const params = useSearchParams();

  // Deux filtres distincts : la marque réelle (lien « par marque » du Dashboard)
  // et le lot d'achat, qui garde les libellés d'origine.
  const [marque, setMarque] = useState(params.get("marque") ?? "");
  const [lot, setLot] = useState(params.get("lot") ?? "");
  // Initialisé depuis l'URL : les liens de notifications ouvrent une vue filtrée
  // (ex. /stock?statut=Brouillon).
  const [statut, setStatut] = useState(params.get("statut") ?? "");
  // `qInput` pilote le champ (instantané) ; `q` est la valeur débouncée envoyée
  // à l'API → évite une requête réseau (et un refetch de 1000+ lignes) par frappe.
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("sku");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Filtre par commande : initialisé depuis l'URL (lien "Voir les articles"),
  // puis pilotable via le dropdown. Synchronisé si l'URL change.
  const commandeParam = params.get("commande") ?? "";
  const [commande, setCommande] = useState(commandeParam);
  useEffect(() => {
    setCommande(commandeParam);
  }, [commandeParam]);

  // Idem statut : si l'URL change (navigation douce depuis la cloche vers un
  // autre filtre), on resynchronise. Les chips modifient l'état, pas l'URL, donc
  // cet effet ne les écrase pas.
  const statutParam = params.get("statut") ?? "";
  useEffect(() => {
    setStatut(statutParam);
  }, [statutParam]);

  // Débounce de la recherche SKU (300 ms) avant d'attaquer l'API.
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const { data: commandes = [] } = useCommandes();

  const { data: articles = [], isLoading, isError, error } = useArticles({
    marque: marque || undefined,
    lot: lot || undefined,
    statut: statut || undefined,
    q: q || undefined,
    commande: commande || undefined,
  });

  // Compteurs des chips de statut : calculés SANS le filtre de statut. Sinon la
  // liste ne contient que le statut actif et tous les autres compteurs tombent
  // à 0. Les autres filtres restent appliqués : le compteur annonce donc bien ce
  // que donnerait le clic. Sans statut actif, la clé de cache est identique à
  // celle de la requête principale → pas d'appel réseau supplémentaire.
  const { data: articlesTousStatuts = [] } = useArticles({
    marque: marque || undefined,
    lot: lot || undefined,
    q: q || undefined,
    commande: commande || undefined,
  });

  // Un seul passage sur la liste plutôt qu'un `filter` par chip : à 1 200
  // articles et onze statuts, la version précédente relisait 13 000 lignes à
  // chaque rendu — et le tableau virtualisé en déclenche beaucoup.
  const statutCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of articlesTousStatuts) {
      counts.set(a.statut, (counts.get(a.statut) ?? 0) + 1);
    }
    return counts;
  }, [articlesTousStatuts]);

  const update = useUpdateArticle();
  const del = useDeleteArticle();
  const bulk = useBulkUpdateStatus();

  const [newCommande, setNewCommande] = useState(false);
  const [sellTarget, setSellTarget] = useState<ArticleDTO | null>(null);
  const [detailTarget, setDetailTarget] = useState<ArticleDTO | null>(null);
  // Confirmations (AlertDialog): leaving « Vendu » (ST-1), deleting (ST-23),
  // a bulk change that hits sold articles (ST-2).
  const [quitterVendu, setQuitterVendu] = useState<
    { article: ArticleDTO; statut: string; message: Confirmation } | null
  >(null);
  const [aSupprimer, setASupprimer] = useState<ArticleDTO | null>(null);
  const [confirmationGroupe, setConfirmationGroupe] = useState<
    { ids: string[]; message: Confirmation } | null
  >(null);

  // --- Colonnes masquables (préférences persistées dans localStorage) ---
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(
    defaultColumnVisibility,
  );
  const [colsOpen, setColsOpen] = useState(false);

  // Chargement des préférences au montage (client uniquement).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLUMN_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Record<string, boolean>;
      setVisibleCols((prev) => {
        const next = { ...prev };
        for (const c of COLUMN_META) {
          if (c.always) next[c.key] = true;
          else if (typeof saved[c.key] === "boolean") next[c.key] = saved[c.key];
        }
        return next;
      });
    } catch {
      /* préférences invalides : on garde les valeurs par défaut */
    }
  }, []);

  // Le sélecteur de colonnes n'est plus un menu flottant mais un rang de cases
  // qui pousse le tableau vers le bas dans le module : plus de fermeture au
  // clic extérieur à gérer, et on voit le tableau se recomposer sous les yeux
  // pendant qu'on coche.

  const toggleCol = (key: SortKey) => {
    const meta = COLUMN_META.find((c) => c.key === key);
    if (meta?.always) return;
    setVisibleCols((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* stockage indisponible : on ignore */
      }
      return next;
    });
  };

  const shownColumns = COLUMN_META.filter((c) => visibleCols[c.key]);
  const colCount = shownColumns.length + 2; // case à cocher + actions

  // --- Sélection en masse ---
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatut, setBulkStatut] = useState("En stock");

  const toggleOne = useCallback(
    (id: string) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    [],
  );

  const clearSelection = () => setSelected(new Set());

  // Sends the bulk change for `ids` only (same body as before: { ids, statut }).
  // The rows written leave the selection; the ones hidden by the filters stay
  // selected, still counted in the bar.
  const envoyerGroupe = (ids: string[]) => {
    bulk.mutate(
      { ids, statut: bulkStatut },
      {
        onSuccess: () =>
          setSelected((prev) => {
            const next = new Set(prev);
            for (const id of ids) next.delete(id);
            return next;
          }),
        onSettled: () => setConfirmationGroupe(null),
      },
    );
  };

  // Listes des filtres (calculées depuis les données chargées). Deux axes
  // distincts : la marque réelle (Adidas) et le lot d'achat (« Short Adidas »).
  const marqueOptions = useMemo(() => {
    const set = new Set(articles.map((a) => a.marque));
    if (marque) set.add(marque);
    return Array.from(set).sort();
  }, [articles, marque]);

  const lotOptions = useMemo(() => {
    const set = new Set(
      articles.map((a) => a.lot).filter((l): l is string => !!l),
    );
    if (lot) set.add(lot);
    return Array.from(set).sort();
  }, [articles, lot]);

  const sorted = useMemo(() => {
    const copy = [...articles];
    copy.sort((a, b) => {
      const c = compare(a, b, sortKey);
      return sortDir === "asc" ? c : -c;
    });
    return copy;
  }, [articles, sortKey, sortDir]);

  // Sélection par glissement (souris, tableau desktop). Refs tenues à jour pour
  // que les handlers globaux lisent toujours l'état courant sans se recréer.
  const sortedRef = useRef(sorted);
  sortedRef.current = sorted;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const onSelectPointerDown = useDragSelect(sortedRef, selectedRef, setSelected);

  // ST-2: « Appliquer » only writes the selected rows the filters show.
  const cible = useMemo(() => cibleSelection(selected, sorted), [selected, sorted]);

  const applyBulk = () => {
    if (cible.ids.length === 0 || bulk.isPending) return;
    const message = messageChangementGroupe(cible.ids.length, cible.vendus);
    if (message) setConfirmationGroupe({ ids: cible.ids, message });
    else envoyerGroupe(cible.ids);
  };

  // --- Virtualisation : ne monte que les lignes/cartes visibles (+ overscan).
  // Une seule liste rendue à la fois selon le breakpoint (cf. useIsDesktop).
  const isDesktop = useIsDesktop();
  const loaded = !isLoading && !isError;
  const showRows = loaded && sorted.length > 0;
  const showEmpty = loaded && sorted.length === 0;

  const desktopWrapRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useWindowVirtualizer({
    count: sorted.length,
    // Every row is exactly HAUTEUR_LIGNE_PX high (set on its <tr>), so rows
    // are not measured: a wrong size would drift over the whole stock (it
    // was 54 for 45 px rows once, ~11 000 px off on 1 200 articles).
    estimateSize: () => HAUTEUR_LIGNE_PX,
    overscan: 8,
    scrollMargin: desktopWrapRef.current?.offsetTop ?? 0,
  });

  const mobileWrapRef = useRef<HTMLDivElement>(null);
  const cardVirtualizer = useWindowVirtualizer({
    count: sorted.length,
    estimateSize: () => HAUTEUR_CARTE_PX,
    overscan: 6,
    scrollMargin: mobileWrapRef.current?.offsetTop ?? 0,
  });

  const rows = virtualWindow(rowVirtualizer);
  const cards = virtualWindow(cardVirtualizer);

  const totals = useMemo(() => {
    let enStock = 0;
    let enVente = 0;
    let vendus = 0;
    let ca = 0;
    let net = 0;
    let stockValue = 0; // coût d'achat des articles encore détenus (non vendus/perdus)
    for (const a of articles) {
      if (a.statut === "En stock") enStock += 1;
      if (a.statut === "En vente") enVente += 1;
      if (a.statut === STATUT_VENDU) {
        vendus += 1;
        ca += a.prixVente ?? 0;
        net += a.margeNette ?? 0;
      } else if (a.statut !== "Perdu") {
        stockValue += a.prixAchat ?? 0;
      }
    }
    return {
      total: articles.length,
      enStock,
      enVente,
      vendus,
      ca,
      net,
      stockValue,
    };
  }, [articles]);

  // Export CSV des lignes affichées (filtres, tri ET colonnes visibles respectés).
  const exportCSV = () => {
    const commandeName = (id: string | null) => {
      if (!id) return "";
      const c = commandes.find((x) => x.id === id);
      return c ? `${c.fournisseur} (${new Date(c.date).toLocaleDateString("fr-FR")})` : "";
    };
    const headers = [...shownColumns.map((c) => c.label), "Commande"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = sorted.map((a) =>
      [
        ...shownColumns.map((c) => CSV_VALUE[c.key](a)),
        commandeName(a.commandeId),
      ]
        .map(esc)
        .join(";"),
    );
    const csv = [headers.map(esc).join(";"), ...lines].join("\r\n");
    // BOM pour qu'Excel reconnaisse l'UTF-8.
    const blob = new Blob(["﻿" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const today = new Date().toISOString().slice(0, 10);
    const link = document.createElement("a");
    link.href = url;
    link.download = `myflip-stock-${today}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const handlePatch = useCallback(
    (id: string, p: ArticlePatch) => update.mutate({ id, patch: p }),
    [update],
  );

  const handleStatutChange = useCallback(
    (a: ArticleDTO, value: string) => {
      if (value === STATUT_VENDU) {
        setSellTarget(a);
        return;
      }
      // ST-1: leaving « Vendu » erases the sale: ask first, write only on
      // confirmation. The native select stays controlled by the article, so
      // it keeps showing « Vendu » until then.
      const message = messageQuitterVendu(a, value);
      if (message) setQuitterVendu({ article: a, statut: value, message });
      else handlePatch(a.id, { statut: value });
    },
    [handlePatch],
  );

  const handleDelete = useCallback((a: ArticleDTO) => setASupprimer(a), []);

  const confirmerSuppression = () => {
    const a = aSupprimer;
    if (!a || del.isPending) return;
    del.mutate(a.id, {
      onSuccess: () => toast.success(`${a.sku} supprimé.`),
      onError: (e) => toast.error((e as Error).message),
      onSettled: () => setASupprimer(null),
    });
  };

  const handleShowDetail = useCallback((a: ArticleDTO) => setDetailTarget(a), []);

  const hasFilters = !!(marque || lot || statut || qInput || commande);

  const resetFilters = () => {
    setMarque("");
    setLot("");
    setStatut("");
    setQInput("");
    setQ("");
    setCommande("");
    router.replace("/stock");
  };

  // Pied de liste : compte, rappel d'édition et agrégats de la vue filtrée.
  // Rendu deux fois — dans le module en desktop, sous les cartes en mobile —
  // d'où l'extraction plutôt qu'une duplication du balisage.
  const summary = (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 font-mono text-xs text-ink-3">
      <span>
        <span className="font-bold text-ink-2">
          {sorted.length.toLocaleString("fr-FR")}
        </span>{" "}
        ligne{sorted.length > 1 ? "s" : ""} affichée
        {sorted.length > 1 ? "s" : ""}
        <span className="hidden md:inline">
          {" "}
          — double-clic sur une cellule pour éditer
        </span>
      </span>
      <span className="flex flex-wrap gap-x-4 gap-y-1">
        <span>{totals.enStock.toLocaleString("fr-FR")} en stock</span>
        <span>{totals.vendus.toLocaleString("fr-FR")} vendus</span>
        <span>
          marge nette{" "}
          <span className="font-bold text-pos">{euros(totals.net)}</span>
        </span>
      </span>
    </div>
  );

  // Article « vivant » pour le modal détail : on relit depuis la liste chargée
  // pour que les valeurs dérivées (marge nette) reflètent immédiatement une
  // correction inline (detailTarget est une copie figée au moment du clic).
  const detail = detailTarget
    ? articles.find((a) => a.id === detailTarget.id) ?? detailTarget
    : null;

  return (
    <Frame>
      {/* Bandeau de KPI — quatre chiffres, aucun ornement. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          value={totals.total.toLocaleString("fr-FR")}
          label="Articles au total"
        />
        <KpiCard
          value={totals.enVente.toLocaleString("fr-FR")}
          label="En vente"
        />
        <KpiCard
          value={totals.vendus.toLocaleString("fr-FR")}
          label="Vendus"
        />
        <KpiCard dark value={euros(totals.stockValue)} label="Valeur du stock" />
      </div>

      {/* Module console : outils, filtres, chips, tableau et pied de liste ne
          forment qu'un seul bloc. Avant, ces quatre zones flottaient
          séparément sur le fond de page et chacune redemandait au regard de
          se réorienter ; ici, tout ce qui agit sur la liste vit dans le même
          conteneur que la liste. */}
      <section className="overflow-hidden rounded-lg border border-line bg-surface">
        <div className="flex flex-col gap-2 p-3.5 md:flex-row md:flex-wrap md:items-center">
          <label
            className={`${CTRL} flex w-full items-center gap-2.5 px-4 focus-within:ring-2 focus-within:ring-focus md:min-w-[200px] md:flex-1`}
          >
            <Search
              aria-hidden
              className="h-4 w-4 flex-none text-ink-3"
              strokeWidth={2}
            />
            <input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Rechercher un SKU…"
              aria-label="Rechercher un SKU"
              className="w-full bg-transparent font-mono text-sm text-ink placeholder:text-ink-3 focus-visible:outline-none"
            />
          </label>
          <select
            value={marque}
            onChange={(e) => setMarque(e.target.value)}
            aria-label="Filtrer par marque"
            className={`${CTRL_SELECT} w-full md:w-auto`}
          >
            <option value="">Toutes les marques</option>
            {marqueOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          {/* Filtre par lot d'achat : garde les libellés d'origine
              (« Short Adidas », « Crazy Polaires »…) que la marque ne porte plus. */}
          <select
            value={lot}
            onChange={(e) => setLot(e.target.value)}
            aria-label="Filtrer par lot"
            className={`${CTRL_SELECT} w-full md:w-auto`}
          >
            <option value="">Tous les lots</option>
            {lotOptions.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          <select
            value={commande}
            onChange={(e) => setCommande(e.target.value)}
            aria-label="Filtrer par commande"
            className={`${CTRL_SELECT} w-full md:w-auto`}
          >
            <option value="">Toutes les commandes</option>
            {commandes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.fournisseur} — {new Date(c.date).toLocaleDateString("fr-FR")}
              </option>
            ))}
          </select>
          {/* Colonnes et export : sans objet sur la vue cartes. */}
          <Button
            variant="secondary"
            onClick={() => setColsOpen((o) => !o)}
            aria-expanded={colsOpen}
            className={cn(CTRL_BTN, "hidden md:inline-flex", colsOpen && "border-line-strong")}
          >
            <SlidersHorizontal aria-hidden className="h-4 w-4" strokeWidth={2} />
            Colonnes
          </Button>
          <Button
            variant="secondary"
            onClick={exportCSV}
            className={cn(CTRL_BTN, "hidden md:inline-flex")}
          >
            <Download aria-hidden className="h-4 w-4" strokeWidth={2} />
            Export CSV
          </Button>
          <Button
            onClick={() => setNewCommande(true)}
            className="h-11 w-full rounded-full px-4 text-sm font-bold shadow-pop md:h-10 md:w-auto"
          >
            <Plus aria-hidden className="h-4 w-4" strokeWidth={2.3} />
            Nouvelle commande
          </Button>
          {hasFilters && (
            <Button
              variant="secondary"
              onClick={resetFilters}
              className={cn(CTRL_BTN, "w-full justify-center md:w-auto")}
            >
              Réinitialiser
            </Button>
          )}
        </div>

        {colsOpen && (
          <div className="hidden flex-wrap gap-2 px-3.5 pb-3 md:flex">
            {COLUMN_META.map((c) => (
              <ColumnChip
                key={c.key}
                label={c.label}
                checked={!!visibleCols[c.key]}
                locked={c.always}
                onToggle={() => toggleCol(c.key)}
              />
            ))}
            {/* La colonne Actions ne fait pas partie de COLUMN_META (elle n'est
                ni triable ni exportable) mais reste listée ici pour que le rang
                de cases décrive le tableau en entier. */}
            <ColumnChip label="Actions" checked locked />
          </div>
        )}

        {/* Chips de statut. Affichées à toutes les tailles (défilement
            horizontal en mobile) : la pastille de couleur et le compteur
            disent d'un coup d'œil ce qu'un <select> obligeait à ouvrir. */}
        <div className="flex gap-2 overflow-x-auto px-3.5 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {STATUT_CHIPS.map((chip) => {
            const active = statut === chip.value;
            const cnt =
              chip.value === ""
                ? articlesTousStatuts.length
                : (statutCounts.get(chip.value) ?? 0);
            return (
              <button
                type="button"
                key={chip.value}
                onClick={() => setStatut(chip.value)}
                aria-pressed={active}
                className={`inline-flex min-h-11 flex-none items-center gap-2 whitespace-nowrap rounded-full border px-3.5 text-sm transition-colors duration-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus md:min-h-9 ${
                  active
                    ? "border-accent bg-accent font-bold text-accent-ink"
                    : "border-line bg-surface-2 font-medium text-ink-2 hover:border-line-strong"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-[7px] w-[7px] flex-none rounded-full",
                    chip.value === "" ? "bg-ink-3" : styleStatut(chip.value).repere,
                  )}
                />
                {chip.label}
                <span className="font-mono text-xs tabular-nums opacity-70">
                  {cnt}
                </span>
              </button>
            );
          })}
        </div>

        {/* Tableau (≥ md) — virtualisé, adossé au module (pas de rayon ni de
            bordure propres : il en est la partie basse). */}
        {isDesktop && (
        <div
          ref={desktopWrapRef}
          onPointerDown={onSelectPointerDown}
          className="hidden overflow-x-auto border-t border-line md:block"
        >
          {/* text-base: the body size the rows were sized with (HAUTEUR_LIGNE_PX). */}
          <Table
            style={{ minWidth: Math.max(640, colCount * 96) }}
            className="text-base"
          >
            <THead>
              <tr className={`${MICRO} border-b border-line text-left`}>
                <th
                  scope="col"
                  className="w-10 px-[18px] py-2.5"
                  title="Astuce : glisse le long de cette colonne pour sélectionner plusieurs lignes"
                >
                  <Checkbox
                    aria-label="Tout sélectionner"
                    checked={
                      sorted.length > 0 && sorted.every((a) => selected.has(a.id))
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelected(new Set(sorted.map((a) => a.id)));
                      } else {
                        clearSelection();
                      }
                    }}
                  />
                </th>
                {/* Sortable headers (ST-7): a real button, the sort state in
                    aria-sort. */}
                {shownColumns.map((c) => (
                  <TH
                    key={c.key}
                    tri={c.key === sortKey ? sortDir : "none"}
                    onTri={() => toggleSort(c.key)}
                    className={cn(
                      "h-auto select-none whitespace-nowrap border-b-0 px-2.5 py-2.5 font-mono font-medium tracking-[0.14em] text-ink-3",
                      c.align === "right" && "text-right",
                    )}
                  >
                    {c.label}
                  </TH>
                ))}
                <ColonneActions as="th" className="bg-surface-2 px-[18px] py-2.5">
                  Actions
                </ColonneActions>
              </tr>
            </THead>
            <TBody>
              {isLoading && (
                <tr>
                  <td colSpan={colCount + 1} className="py-12">
                    <Loader label="Chargement du stock" />
                  </td>
                </tr>
              )}
              {isError && (
                <tr>
                  <td colSpan={colCount} className="px-3 py-10 text-center text-neg">
                    {(error as Error).message}
                  </td>
                </tr>
              )}
              {showEmpty && (
                <tr>
                  <td colSpan={colCount} className="px-3 py-10 text-center text-ink-3">
                    Aucun article.
                  </td>
                </tr>
              )}
              {showRows && (
                <>
                  {rows.padTop > 0 && (
                    <tr aria-hidden>
                      <td
                        colSpan={colCount}
                        style={{ height: rows.padTop, padding: 0, border: 0 }}
                      />
                    </tr>
                  )}
                  {rows.items.map((vr) => {
                    const a = sorted[vr.index];
                    return (
                      <ArticleRow
                        key={a.id}
                        data-index={vr.index}
                        a={a}
                        shownColumns={shownColumns}
                        isSelected={selected.has(a.id)}
                        onToggleSelect={toggleOne}
                        onPatch={handlePatch}
                        onStatutChange={handleStatutChange}
                        onDelete={handleDelete}
                        onShowDetail={handleShowDetail}
                      />
                    );
                  })}
                  {rows.padBottom > 0 && (
                    <tr aria-hidden>
                      <td
                        colSpan={colCount}
                        style={{ height: rows.padBottom, padding: 0, border: 0 }}
                      />
                    </tr>
                  )}
                </>
              )}
            </TBody>
          </Table>
        </div>
        )}

        {isDesktop && (
          <div className="hidden border-t border-line md:block">
            {summary}
          </div>
        )}
      </section>

      {/* Vue cartes mobile (< md) — virtualisée. Hors du module : imbriquer des
          cartes dans une carte donnerait deux niveaux de bordure à 390px. */}
      {!isDesktop && (
        <div className="md:hidden">
          <div ref={mobileWrapRef}>
            {isLoading && <Loader label="Chargement du stock" />}
            {isError && (
              <p className="rounded-lg border border-line bg-surface px-4 py-6 text-center text-neg">
                {(error as Error).message}
              </p>
            )}
            {showEmpty && (
              <p className="rounded-lg border border-line bg-surface px-4 py-6 text-center text-ink-3">
                Aucun article.
              </p>
            )}
            {showRows && (
              <>
                {cards.padTop > 0 && (
                  <div aria-hidden style={{ height: cards.padTop }} />
                )}
                {cards.items.map((vr) => {
                  const a = sorted[vr.index];
                  return (
                    <ArticleCard
                      key={a.id}
                      data-index={vr.index}
                      ref={cardVirtualizer.measureElement}
                      a={a}
                      isSelected={selected.has(a.id)}
                      onToggleSelect={toggleOne}
                      onStatutChange={handleStatutChange}
                      onDelete={handleDelete}
                      onShowDetail={handleShowDetail}
                    />
                  );
                })}
                {cards.padBottom > 0 && (
                  <div aria-hidden style={{ height: cards.padBottom }} />
                )}
              </>
            )}
          </div>
          {showRows && (
            <div className="rounded-lg border border-line bg-surface">
              {summary}
            </div>
          )}
        </div>
      )}

      {/* Barre d'action flottante (sélection en masse), au-dessus du dock en
          mobile et à droite du menu en ordinateur (BarreActions, ST-3).
          Elle reste flottante et n'a pas rejoint le module comme dans la
          maquette : la liste étant virtualisée sur plus de mille lignes, une
          barre ancrée en haut du module serait hors écran au moment précis où
          l'on vient de sélectionner à la souris tout en bas. */}
      <BarreActions
        ouverte={selected.size > 0}
        ton="bar"
        aria-label="Actions sur la sélection"
        className="flex-wrap"
      >
        {/* ST-2: the count says how many selected rows the filters hide; they
            are not written. */}
        <span role="status" className="pl-2 font-mono text-sm font-bold tabular-nums text-bar-ink">
          {libelleSelection(selected.size, cible.masques)}
        </span>
        <span aria-hidden className="h-4 w-px bg-bar-ink/30" />
        <label htmlFor="statut-groupe" className="text-xs font-medium text-bar-ink">
          Statut
        </label>
        <Select
          id="statut-groupe"
          value={bulkStatut}
          onChange={(e) => setBulkStatut(e.target.value)}
          className="w-auto"
          selectClassName="border-line-strong bg-surface text-ink md:h-8 md:text-sm"
        >
          {STATUTS.filter((s) => s !== STATUT_VENDU).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Button
          variant="bar"
          size="sm"
          pending={bulk.isPending}
          pendingLabel="…"
          disabled={cible.ids.length === 0}
          onClick={applyBulk}
        >
          Appliquer
        </Button>
        <IconButton
          label="Annuler la sélection"
          onClick={clearSelection}
          className="text-bar-ink hover:bg-transparent hover:text-bar-ink md:h-8 md:w-8"
        >
          <X aria-hidden className="h-4 w-4" strokeWidth={2.2} />
        </IconButton>
      </BarreActions>

      <NewCommandeModal
        open={newCommande}
        onClose={() => setNewCommande(false)}
      />
      <FenetreVente article={sellTarget} contexte="stock" onClose={() => setSellTarget(null)} />

      <Dialog
        open={!!detailTarget}
        onOpenChange={(ouvert) => {
          if (!ouvert) setDetailTarget(null);
        }}
        title={detailTarget ? detailTarget.sku : ""}
      >
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-base">
              <StatutBadge statut={detail.statut} />
              <span className="text-ink-2">
                <span className="text-ink-3">Marque : </span>
                {detail.marque}
              </span>
              <span className="text-ink-2">
                <span className="text-ink-3">Catégorie : </span>
                {detail.categorie}
              </span>
              <span className="text-ink-2">
                <span className="text-ink-3">Prix achat : </span>
                {euros(detail.prixAchat)}
              </span>
            </div>

            {detail.statut === STATUT_VENDU && (
              <div className="space-y-3 border-t border-line pt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-3">
                  Informations de vente
                </h3>
                <p className="text-xs font-medium text-ink-3">
                  Double-clic sur une valeur pour corriger une erreur de saisie.
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-base">
                  <div>
                    <span className="mb-0.5 block text-xs font-medium text-ink-3">
                      Prix de vente
                    </span>
                    <EditableCell
                      value={detail.prixVente}
                      display={
                        detail.prixVente != null ? euros(detail.prixVente) : "—"
                      }
                      type="number"
                      champ="prix de vente"
                      sku={detail.sku}
                      onSave={(v) =>
                        handlePatch(detail.id, { prixVente: Number(v) })
                      }
                    />
                  </div>
                  <div>
                    <span className="mb-0.5 block text-xs font-medium text-ink-3">
                      Date de vente
                    </span>
                    <EditableCell
                      value={detail.dateVente ? detail.dateVente.slice(0, 10) : null}
                      display={
                        detail.dateVente
                          ? new Date(detail.dateVente).toLocaleDateString("fr-FR")
                          : "—"
                      }
                      type="text"
                      champ="date de vente"
                      sku={detail.sku}
                      onSave={(v) =>
                        handlePatch(detail.id, {
                          dateVente: v ? new Date(v).toISOString() : null,
                        })
                      }
                    />
                  </div>
                  <div>
                    <span className="mb-0.5 block text-xs font-medium text-ink-3">
                      Canal
                    </span>
                    <Select
                      aria-label="Canal"
                      value={detail.canal ?? ""}
                      onChange={(e) =>
                        handlePatch(detail.id, { canal: e.target.value })
                      }
                      className="mt-0.5"
                    >
                      {detail.canal == null && <option value="">—</option>}
                      {CANAUX.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <span className="mb-0.5 block text-xs font-medium text-ink-3">
                      Marge nette
                    </span>
                    <span
                      className={`mt-0.5 block px-2 py-1 font-medium ${
                        detail.margeNette != null && detail.margeNette < 0
                          ? "text-neg"
                          : "text-accent-text"
                      }`}
                    >
                      {detail.margeNette != null ? euros(detail.margeNette) : "—"}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {detail.titreAnnonce ? (
              <div className="space-y-3 border-t border-line pt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-3">
                  Annonce
                </h3>
                <DetailCopyField label="Titre" value={detail.titreAnnonce} />
                <DetailCopyField
                  label="Description"
                  value={detail.descriptionAnnonce ?? ""}
                  multiline
                />
                <DetailCopyField
                  label="Mots-clés"
                  value={detail.motsClesAnnonce ?? ""}
                />
              </div>
            ) : (
              <p className="border-t border-line pt-4 text-base text-ink-3">
                Aucune annonce générée.{" "}
                <a href="/mise-en-vente" className="text-accent-text underline">
                  Créer une annonce
                </a>
              </p>
            )}
          </div>
        )}
      </Dialog>

      {/* ST-1: leaving « Vendu ». */}
      <AlertDialog
        open={!!quitterVendu}
        onOpenChange={(ouvert) => {
          if (!ouvert) setQuitterVendu(null);
        }}
        title={quitterVendu?.message.titre ?? ""}
        description={quitterVendu?.message.corps ?? ""}
        confirmLabel="Annuler la vente"
        cancelLabel="Garder vendu"
        onConfirm={() => {
          if (!quitterVendu) return;
          handlePatch(quitterVendu.article.id, { statut: quitterVendu.statut });
          setQuitterVendu(null);
        }}
      />

      {/* ST-23: deleting an article. */}
      <AlertDialog
        open={!!aSupprimer}
        onOpenChange={(ouvert) => {
          if (!ouvert) setASupprimer(null);
        }}
        title={aSupprimer ? messageSuppression(aSupprimer).titre : ""}
        description={aSupprimer ? messageSuppression(aSupprimer).corps : ""}
        confirmLabel="Supprimer l’article"
        pending={del.isPending}
        pendingLabel="Suppression…"
        onConfirm={confirmerSuppression}
      />

      {/* ST-2: a bulk change that hits sold articles. */}
      <AlertDialog
        open={!!confirmationGroupe}
        onOpenChange={(ouvert) => {
          if (!ouvert) setConfirmationGroupe(null);
        }}
        title={confirmationGroupe?.message.titre ?? ""}
        description={confirmationGroupe?.message.corps ?? ""}
        confirmLabel="Changer le statut"
        pending={bulk.isPending}
        onConfirm={() => {
          if (confirmationGroupe) envoyerGroupe(confirmationGroupe.ids);
        }}
      />
    </Frame>
  );
}

function DetailCopyField({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-md border border-line bg-surface-2 p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-3">
          {label}
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="h-auto rounded-full border-line px-3 py-0.5 text-xs font-medium"
        >
          {copied ? "Copié ✓" : "Copier"}
        </Button>
      </div>
      <p className={`text-base text-ink ${multiline ? "whitespace-pre-wrap" : ""}`}>
        {value || "—"}
      </p>
    </div>
  );
}

export default function StockPage() {
  return (
    <Suspense>
      <StockInner />
    </Suspense>
  );
}
