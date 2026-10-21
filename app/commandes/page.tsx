"use client";
// design-tokens-dette: R2 R6 R15 R16 → M4

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, FileSpreadsheet, Plus } from "lucide-react";
import { toast } from "sonner";
import { useCommandeStats, useCommandes, useDeleteCommande } from "@/lib/hooks";
import { coef, euros } from "@/lib/calc";
import type { CommandeDTO, LotDTO } from "@/lib/types";
import Loader from "@/components/Loader";
import NewCommandeModal from "@/components/NewCommandeModal";
import { CardTitle, Eyebrow, Frame, Module } from "@/components/console";

/**
 * Jeton pilule de Direction C. `accent` est réservé à la valeur qui compte le
 * plus de la série — la maquette n'en allume qu'un seul par groupe, l'accent
 * perdant tout son sens s'il est distribué à tous.
 */
function Chip({
  children,
  accent = false,
}: {
  children: ReactNode;
  accent?: boolean;
}) {
  return (
    <span
      className={`rounded-full px-3.5 py-2 font-mono text-xs ${
        accent
          ? "bg-accent font-bold text-accent-ink"
          : "bg-surface-2 text-ink-2"
      }`}
    >
      {children}
    </span>
  );
}

/** Ligne « Par fournisseur » : nom, montant, et barre de part relative. */
function FournisseurLigne({
  nom,
  total,
  part,
  onClick,
}: {
  nom: string;
  total: number;
  part: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="block w-full border-b border-line py-2.5 text-left last:border-b-0"
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="truncate text-sm text-ink">{nom}</span>
        <span className="flex-none font-mono text-sm [font-variant-numeric:tabular-nums]">
          {euros(total)}
        </span>
      </span>
      <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-surface-2">
        <span
          className="block h-full rounded-full bg-accent"
          style={{ width: `${Math.max(2, Math.round(part * 100))}%` }}
        />
      </span>
    </button>
  );
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.trim().slice(0, 2).toUpperCase();
}

// En dessous de ce nombre de ventes, la projection est signalée comme peu fiable.
const PROJECTION_MIN_VENTES = 10;

/** Date ISO → « 12 nov. ». Renvoie « — » si absente. */
function dateFr(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Tuile de la carte Projection. */
function Metric({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div style={{ borderRadius: 11, background: "rgb(var(--surface-2))", padding: "10px 12px" }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "rgb(var(--ink-3))" }}>
        {label}
      </div>
      <div style={{ marginTop: 3, fontSize: 18, fontWeight: 700, color: color ?? "rgb(var(--ink))" }}>
        {value}
      </div>
      {sub && (
        <div style={{ marginTop: 1, fontSize: 11.5, color: "rgb(var(--ink-3))" }}>{sub}</div>
      )}
    </div>
  );
}

function getRenta(recovered: number, invested: number) {
  if (recovered >= invested)
    return { label: "Rentabilisée", color: "rgb(var(--pos))", bg: "rgb(var(--pos-soft))", key: "rentable" as const };
  if (recovered < invested * 0.5)
    return { label: "En cours", color: "rgb(var(--neg))", bg: "rgb(var(--neg-soft))", key: "encours" as const };
  return { label: "Seuil proche", color: "rgb(var(--warn))", bg: "rgb(var(--warn-soft))", key: "proche" as const };
}

function pctColor(pct: number) {
  if (pct < 0.3) return "rgb(var(--neg))";
  if (pct <= 0.6) return "rgb(var(--warn))";
  return "rgb(var(--pos))";
}

// ── Courbe d'investissement ───────────────────────────────────────────────
// Direction C la veut discrète : un tracé, un aplat, et l'axe des mois en
// chasse fixe sous le graphe. Pas d'étiquette par point — le chiffre héros
// juste au-dessus porte déjà la valeur, les répéter huit fois la diluait.
type Mois = { key: string; label: string; value: number };

function Sparkline({ months }: { months: Mois[] }) {
  const n = months.length;
  if (n === 0) return null;
  const max = Math.max(1, ...months.map((m) => m.value));
  const xs = months.map((_, i) => (i * 420) / Math.max(1, n - 1));
  const ys = months.map((m) => 110 - (m.value / max) * 96);
  const pts = xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");

  return (
    <>
      <svg
        viewBox="0 0 420 120"
        preserveAspectRatio="none"
        className="mt-5 block h-[130px] w-full"
        aria-label="Investissement dans le temps"
      >
        <polyline
          points={pts}
          fill="none"
          stroke="rgb(var(--accent))"
          strokeWidth="2.5"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <polygon points={`${pts} 420,120 0,120`} fill="rgb(var(--accent))" opacity=".1" />
      </svg>
      <div className="mt-1.5 flex justify-between font-mono text-xs uppercase tracking-[0.1em] text-ink-3">
        {months.map((m) => (
          <span key={m.key}>{m.label}</span>
        ))}
      </div>
    </>
  );
}

// ── Detail panel (inside the slide-down) ──────────────────────────────────────
function CommandeDetailPanel({
  commandeId,
  coutTotal,
  coefObjectif,
  lots,
}: {
  commandeId: string;
  coutTotal: number;
  coefObjectif: number | null;
  lots: LotDTO[];
}) {
  const { data: stats, isLoading } = useCommandeStats(commandeId);

  if (isLoading) {
    return (
      <div style={{ padding: "24px 0", display: "flex", justifyContent: "center" }}>
        <Loader size="sm" />
      </div>
    );
  }
  if (!stats || stats.rows.length === 0) {
    return (
      <p style={{ margin: 0, padding: "16px 0", fontSize: 14, color: "rgb(var(--ink-3))" }}>
        Aucun article dans cette commande.
      </p>
    );
  }

  const r = stats.resume;
  const montantRecupere = r.montantRecupere;
  const resteARecuperer = r.resteARecuperer;
  const ratio = coutTotal > 0 ? montantRecupere / coutTotal : 0;
  const width = Math.min(100, Math.round(ratio * 100));
  const statut = getRenta(montantRecupere, coutTotal);
  const rembourse = montantRecupere >= coutTotal;

  // L'objectif est-il tenable au rythme de prix actuel ?
  const objectifTenu =
    r.coefObjectif != null && r.coefProjete != null
      ? r.coefProjete >= r.coefObjectif
      : null;

  return (
    <div>
      {/* Composition : ce que contient réellement la commande. Affichée en
          premier — c'est la question qu'on se pose avant la rentabilité, et
          c'est ce qui explique deux prix d'achat différents dans un même
          achat. Masquée quand il n'y a qu'un lot : elle n'apprendrait rien. */}
      {lots.length > 1 && (
        <div style={{ borderRadius: 14, border: "1px solid rgb(var(--line))", background: "rgb(var(--surface))", padding: "16px 18px", marginBottom: 16 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "rgb(var(--ink))" }}>
            {lots.length} lots
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {lots.map((l) => (
              <div key={l.id} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, fontSize: 13.5 }}>
                <span style={{ minWidth: 0 }}>
                  <strong style={{ color: "rgb(var(--ink))" }}>{l.nom}</strong>
                  <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 11.5, color: "rgb(var(--ink-3))", marginLeft: 8 }}>
                    {l.prefixeSku} · {l.modeSaisie === "PIECE" ? "pièce par pièce" : "au lot"}
                  </span>
                </span>
                <span style={{ flex: "none", fontFamily: "var(--font-mono, monospace)", color: "rgb(var(--ink-3))" }}>
                  {l.quantite} × {euros(l.quantite > 0 ? l.prixTotal / l.quantite : 0)}
                  <strong style={{ color: "rgb(var(--ink))", marginLeft: 10 }}>{euros(l.prixTotal)}</strong>
                </span>
              </div>
            ))}
          </div>
          <p style={{ margin: "10px 0 0", fontSize: 12, color: "rgb(var(--ink-3))" }}>
            Prix hors livraison. Les frais de port sont répartis au prorata sur
            les pièces de tous les lots.
          </p>
        </div>
      )}

      {/* Rentabilité card */}
      <div style={{ borderRadius: 14, border: "1px solid rgb(var(--line))", background: "rgb(var(--surface-2))", padding: "16px 18px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "rgb(var(--ink))" }}>Rentabilité</h3>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: statut.bg, color: statut.color }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: statut.color, display: "inline-block" }} />
            {statut.label}
          </span>
        </div>
        <div style={{ height: 11, width: "100%", borderRadius: 8, background: "rgb(var(--surface-2))", overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 8, width: `${width}%`, background: statut.color, transition: "width .8s cubic-bezier(.34,1.2,.5,1)" }} />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 26px", marginTop: 12, fontSize: 13.5, color: "rgb(var(--ink-3))" }}>
          <span>Investi&nbsp;: <strong style={{ color: "rgb(var(--ink))" }}>{euros(coutTotal)}</strong></span>
          <span>Récupéré&nbsp;: <strong style={{ color: "rgb(var(--ink))" }}>{euros(montantRecupere)}</strong></span>
          <span>Reste&nbsp;: <strong style={{ color: statut.color }}>{euros(resteARecuperer)}</strong></span>
          <span>
            Vendus&nbsp;: <strong style={{ color: "rgb(var(--ink))" }}>{r.vendus}/{r.totalArticles}</strong>
            {r.perdus > 0 && (
              <span style={{ color: "rgb(var(--neg))" }}> · {r.perdus} perdu{r.perdus > 1 ? "s" : ""}</span>
            )}
          </span>
        </div>
        <p style={{ margin: "10px 0 0", fontSize: 12, color: "rgb(var(--ink-3))" }}>
          {rembourse
            ? `✓ Investissement récupéré${r.joursPointMort != null ? ` le ${dateFr(r.datePointMort)}, au ${r.joursPointMort}ᵉ jour` : ""}. Marge nette encaissée : ${euros(r.margeNetteRealisee)}.`
            : r.seuilArticles != null && r.panierMoyen != null
              ? `Seuil de rentabilité : vendre ${r.seuilArticles} article${r.seuilArticles > 1 ? "s" : ""} de plus au panier moyen de ${euros(r.panierMoyen)}.`
              : "Aucune vente : panier moyen indisponible pour estimer le seuil."}
        </p>
      </div>

      {/* Projection : où ce lot atterrit */}
      {r.panierMoyen != null && (
        <div style={{ borderRadius: 14, border: "1px solid rgb(var(--line))", background: "rgb(var(--surface))", padding: "16px 18px", marginBottom: 16 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "rgb(var(--ink))" }}>
            Projection
          </h3>

          {/* Toute la projection extrapole le panier moyen. Sur une poignée de
              ventes, elle ne vaut rien : le dire plutôt que d'afficher un
              coefficient rassurant calculé sur 7 articles. */}
          {r.vendus < PROJECTION_MIN_VENTES && (
            <p style={{ margin: "0 0 12px", padding: "8px 11px", borderRadius: 9, background: "rgb(var(--warn-soft))", color: "rgb(var(--warn))", fontSize: 12, fontWeight: 600 }}>
              Projection calculée sur {r.vendus} vente{r.vendus > 1 ? "s" : ""} seulement
              {r.totalArticles > 0 && ` (${Math.round((r.vendus / r.totalArticles) * 100)} % du lot)`}
              {" "}— indicative, à confirmer avec plus de ventes.
            </p>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
            <Metric
              label="Coef actuel"
              value={r.coefActuel != null ? `${r.coefActuel.toFixed(2)}×` : "—"}
              sub={`panier ${euros(r.panierMoyen)}`}
            />
            <Metric
              label="Coef projeté"
              value={r.coefProjete != null ? `${r.coefProjete.toFixed(2)}×` : "—"}
              sub={
                r.coefObjectif != null
                  ? `objectif ${r.coefObjectif.toFixed(2)}×`
                  : "sans objectif"
              }
              color={
                objectifTenu == null ? undefined : objectifTenu ? "rgb(var(--pos))" : "rgb(var(--neg))"
              }
            />
            <Metric
              label="CA projeté"
              value={r.caProjete != null ? euros(r.caProjete) : "—"}
              sub={
                r.margeProjetee != null
                  ? `marge nette ≈ ${euros(r.margeProjetee)}`
                  : undefined
              }
            />
            <Metric
              label="Rythme"
              value={r.rythmeHebdo != null ? `${r.rythmeHebdo.toFixed(1)}/sem.` : "—"}
              sub={r.rythmeRecent ? "4 dernières semaines" : "depuis la 1re vente"}
            />
          </div>

          <ul
            style={{
              margin: "14px 0 0",
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: 7,
              fontSize: 12.5,
              color: "rgb(var(--ink-2))",
            }}
          >
            {/* La ligne qui change une décision : faut-il remonter les prix ? */}
            {r.prixMoyenRequis != null && r.coefObjectif != null && r.restants > 0 && (
              <li>
                {objectifTenu
                  ? `✓ Objectif ${r.coefObjectif.toFixed(2)}× tenable : les ${r.restants} restants peuvent partir dès ${euros(r.prixMoyenRequis)} en moyenne.`
                  : `⚠ Pour tenir l'objectif ${r.coefObjectif.toFixed(2)}×, les ${r.restants} restants doivent partir à ${euros(r.prixMoyenRequis)} en moyenne — soit ${euros(r.prixMoyenRequis - r.panierMoyen)} de plus que le panier actuel.`}
              </li>
            )}
            {r.dateEcoulement != null && r.restants > 0 && (
              <li>
                À ce rythme, les {r.restants} articles restants s’écoulent vers le{" "}
                <strong style={{ color: "rgb(var(--ink))" }}>{dateFr(r.dateEcoulement)}</strong>{" "}
                (≈ {r.joursEcoulement} j).
              </li>
            )}
            {r.delaiMoyenVente != null && (
              <li>
                Commande passée il y a {r.ageJours} j · délai moyen entre l’achat et la
                vente : {Math.round(r.delaiMoyenVente)} j.
              </li>
            )}
            {r.dormants > 0 && (
              <li style={{ color: "rgb(var(--warn))" }}>
                {r.dormants} article{r.dormants > 1 ? "s" : ""} jamais mis en vente
                (photos non prêtes)
                {r.caDormant != null ? ` — ≈ ${euros(r.caDormant)} de CA immobilisé` : ""}.
              </li>
            )}
            {r.meilleurLot && r.pireLot && (
              <li>
                Meilleur lot : <strong>{r.meilleurLot.libelle}</strong> (
                {r.meilleurLot.coefMoyen.toFixed(2)}×) · à la traîne :{" "}
                <strong>{r.pireLot.libelle}</strong> (
                {r.pireLot.coefMoyen.toFixed(2)}×).
              </li>
            )}
          </ul>

          {r.canaux.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 20px", marginTop: 12, paddingTop: 12, borderTop: "1px solid rgb(var(--bg))", fontSize: 12.5, color: "rgb(var(--ink-3))" }}>
              {r.canaux.map((c) => (
                <span key={c.canal}>
                  {c.canal} :{" "}
                  <strong style={{ color: "rgb(var(--ink))" }}>{Math.round(c.pctCa * 100)}%</strong>{" "}
                  du CA (panier {euros(c.panierMoyen)}, {c.vendus} vente
                  {c.vendus > 1 ? "s" : ""})
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Category table (grid, no <table>) */}
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 760 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr .8fr .8fr .8fr .8fr 1fr 1.1fr 1fr .9fr", gap: 8, padding: "0 8px 8px", fontSize: 11, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "rgb(var(--ink-3))" }}>
            <div>Lot</div>
            <div style={{ textAlign: "right" }}>Total</div>
            <div style={{ textAlign: "right" }}>En stock</div>
            <div style={{ textAlign: "right" }}>En vente</div>
            <div style={{ textAlign: "right" }}>Vendus</div>
            <div style={{ textAlign: "right" }}>CA (€)</div>
            <div style={{ textAlign: "right" }}>Marge nette</div>
            <div style={{ textAlign: "right" }}>Coef moyen</div>
            <div style={{ textAlign: "right" }}>% vendu</div>
          </div>
          {stats.rows.map((r) => {
            const cc =
              coefObjectif == null || r.coefMoyen === 0
                ? "rgb(var(--ink))"
                : r.coefMoyen < coefObjectif
                  ? "rgb(var(--neg))"
                  : "rgb(var(--pos))";
            return (
              <div key={r.cle} style={{ display: "grid", gridTemplateColumns: "1.4fr .8fr .8fr .8fr .8fr 1fr 1.1fr 1fr .9fr", gap: 8, padding: "10px 8px", borderTop: "1px solid rgb(var(--bg))", fontSize: 13.5, fontVariantNumeric: "tabular-nums" as const }}>
                <div style={{ fontWeight: 600, color: "rgb(var(--ink))" }}>{r.libelle}</div>
                <div style={{ textAlign: "right", color: "rgb(var(--ink-3))" }}>{r.total}</div>
                <div style={{ textAlign: "right", color: "rgb(var(--ink-3))" }}>{r.enStock}</div>
                <div style={{ textAlign: "right", color: "rgb(var(--ink-3))" }}>{r.enVente}</div>
                <div style={{ textAlign: "right", color: "rgb(var(--ink-3))" }}>{r.vendus}</div>
                <div style={{ textAlign: "right", fontWeight: 600, color: "rgb(var(--ink))" }}>{euros(r.ca)}</div>
                <div style={{ textAlign: "right", fontWeight: 600, color: "rgb(var(--pos))" }}>{euros(r.margeNette)}</div>
                <div style={{ textAlign: "right", fontWeight: 700, color: cc }}>{r.coefMoyen > 0 ? coef(r.coefMoyen) : "—"}</div>
                <div style={{ textAlign: "right", fontWeight: 700, color: pctColor(r.pctVendu) }}>{Math.round(r.pctVendu * 100)}%</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Table « Commandes récentes » ─────────────────────────────────────────

/** En-tête de colonne : mono 9,5 px très espacé, la signature de Direction C. */
function Th({
  children,
  align = "left",
  className = "",
}: {
  children: ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  const alignCls =
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <th
      className={`px-2.5 py-2.5 font-mono text-xs font-medium uppercase tracking-[0.14em] text-ink-3 ${alignCls} ${className}`}
    >
      {children}
    </th>
  );
}

/** Pastille de rentabilité, partagée par la ligne de table et la carte mobile. */
function RentaBadge({ statut }: { statut: ReturnType<typeof getRenta> | null }) {
  if (!statut)
    return <span className="font-mono text-xs text-ink-3">—</span>;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-xs uppercase tracking-[0.08em]"
      style={{ background: statut.bg, color: statut.color }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: statut.color }}
      />
      {statut.label}
    </span>
  );
}

/**
 * Une commande dans la table. Le détail dépliable de l'ancienne liste est
 * conservé : il occupe une seconde ligne en `colSpan`, seule façon de garder
 * un `<table>` valide tout en préservant le panneau.

 *
 * Les stats sont chargées pour chaque ligne, pas seulement à l'ouverture : la
 * colonne « Rentabilité » en dépend et doit être lisible sans déplier.
 */
function CommandeTableRow({
  c,
  expanded,
  onToggle,
}: {
  c: CommandeDTO;
  expanded: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();
  const del = useDeleteCommande();
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: stats } = useCommandeStats(c.id);

  const montantRecupere = stats?.rows.reduce((s, r) => s + r.ca, 0) ?? null;
  const statut =
    montantRecupere !== null ? getRenta(montantRecupere, c.coutTotal) : null;

  const handleDelete = () => {
    setMenuOpen(false);
    if (confirm(`Supprimer la commande « ${c.fournisseur} » et ses articles ?`)) {
      del.mutate(c.id, {
        onSuccess: () => toast.success("Commande supprimée."),
        onError: (e) => toast.error((e as Error).message),
      });
    }
  };

  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-b border-line transition-colors hover:bg-surface-2"
      >
        <td className="py-3 pl-5 pr-2.5 font-mono text-xs font-bold">
          {c.fournisseur}
        </td>
        <td className="px-2.5 py-3 font-mono text-xs text-ink-2">
          {new Date(c.date).toLocaleDateString("fr-FR")}
        </td>
        <td className="px-2.5 py-3 text-right font-mono text-sm">
          {c.nbArticles}
        </td>
        <td className="px-2.5 py-3 text-right font-mono text-sm font-bold">
          {euros(c.coutTotal)}
        </td>
        <td className="px-2.5 py-3 text-right font-mono text-sm text-ink-2">
          {euros(c.prixUnitaire)}
        </td>
        <td className="px-2.5 py-3 text-center">
          <RentaBadge statut={statut} />
        </td>
        <td
          className="py-2 pl-2.5 pr-5 text-right"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="relative inline-flex items-center gap-1.5">
            <button
              onClick={onToggle}
              className="inline-flex min-h-[34px] items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 text-xs text-ink-2 transition-colors hover:border-line-strong"
            >
              {expanded ? "Masquer" : "Détail"}
              <ChevronDown
                strokeWidth={2.4}
                className="h-3.5 w-3.5 transition-transform"
                style={{ transform: `rotate(${expanded ? 180 : 0}deg)` }}
              />
            </button>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Actions"
              className="flex h-[34px] w-[34px] items-center justify-center rounded-full text-md leading-none text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink-2"
            >
              ⋯
            </button>
            {menuOpen && (
              <>
                <span
                  className="fixed inset-0 z-overlay"
                  onClick={() => setMenuOpen(false)}
                />
                <span className="absolute right-0 top-[38px] z-popover block w-[184px] rounded-md border border-line bg-surface p-1.5 shadow-pop">
                  <MenuBtn
                    label="Voir les articles"
                    color="rgb(var(--ink-2))"
                    hoverBg="rgb(var(--surface-2))"
                    onClick={() => {
                      router.push(`/stock?commande=${c.id}`);
                      setMenuOpen(false);
                    }}
                  />
                  <MenuBtn
                    label="Supprimer"
                    color="rgb(var(--neg))"
                    hoverBg="rgb(var(--neg-soft))"
                    onClick={handleDelete}
                  />
                </span>
              </>
            )}
          </span>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-line bg-surface-2">
          <td colSpan={7} className="px-5 py-4">
            <CommandeDetailPanel
              commandeId={c.id}
              coutTotal={c.coutTotal}
              coefObjectif={c.coefObjectif}
              lots={c.lots}
            />
          </td>
        </tr>
      )}
    </>
  );
}

/** Rendu mobile : CLAUDE.md interdit la table sous 768 px. */
function CommandeCarte({
  c,
  expanded,
  onToggle,
}: {
  c: CommandeDTO;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { data: stats } = useCommandeStats(c.id);
  const montantRecupere = stats?.rows.reduce((s, r) => s + r.ca, 0) ?? null;
  const statut =
    montantRecupere !== null ? getRenta(montantRecupere, c.coutTotal) : null;

  return (
    <div className="border-b border-line last:border-b-0">
      <button
        onClick={onToggle}
        className="flex min-h-16 w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-md bg-accent font-mono text-xs font-bold text-accent-ink">
            {initials(c.fournisseur)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-base font-semibold">
              {c.fournisseur}
            </span>
            <span className="mt-0.5 block font-mono text-xs uppercase tracking-[0.1em] text-ink-3">
              {new Date(c.date).toLocaleDateString("fr-FR")} · {c.nbArticles} ART.
            </span>
          </span>
        </span>
        <span className="flex-none text-right">
          <span className="block font-mono text-sm font-bold [font-variant-numeric:tabular-nums]">
            {euros(c.coutTotal)}
          </span>
          {statut && (
            <span
              className="mt-0.5 block font-mono text-xs uppercase"
              style={{ color: statut.color }}
            >
              {statut.label}
            </span>
          )}
        </span>
      </button>
      {expanded && (
        <div className="px-4 pb-4">
          <CommandeDetailPanel
            commandeId={c.id}
            coutTotal={c.coutTotal}
            coefObjectif={c.coefObjectif}
            lots={c.lots}
          />
        </div>
      )}
    </div>
  );
}



function MenuBtn({ label, color, hoverBg, onClick }: { label: string; color: string; hoverBg: string; onClick: () => void }) {
  const [h, setH] = useState(false);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        display: "block", width: "100%", textAlign: "left",
        padding: "9px 12px", border: "none",
        background: h ? hoverBg : "transparent",
        borderRadius: 9, fontSize: 13.5, fontWeight: 600, color,
        cursor: "pointer", transition: "background .15s", fontFamily: "inherit",
      }}
    >
      {label}
    </button>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function CommandesPage() {
  const router = useRouter();
  const { data: commandes = [], isLoading, isError, error } = useCommandes();
  const [newCommande, setNewCommande] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleDetail = (id: string) =>
    setExpandedId((prev) => (prev === id ? null : id));

  const kpis = useMemo(() => {
    const totalInvesti = commandes.reduce((s, c) => s + c.coutTotal, 0);
    const totalArticles = commandes.reduce((s, c) => s + c.nbArticles, 0);
    return {
      totalInvesti,
      totalArticles,
      nbCommandes: commandes.length,
      prixUnitMoyen: totalArticles > 0 ? totalInvesti / totalArticles : 0,
    };
  }, [commandes]);

  // Date de la commande la plus récente, pour la ligne mono du module d'ajout.
  const derniereCommande = useMemo(
    () =>
      commandes.reduce<string | null>(
        (recent, c) => (recent === null || c.date > recent ? c.date : recent),
        null,
      ),
    [commandes],
  );

  const months = useMemo(() => {
    const now = new Date();
    const buckets = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString("fr-FR", { month: "short" }), value: 0 };
    });
    for (const c of commandes) {
      const d = new Date(c.date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const b = buckets.find((m) => m.key === key);
      if (b) b.value += c.coutTotal;
    }
    return buckets;
  }, [commandes]);

  const suppliers = useMemo(() => {
    const map = new Map<string, { total: number; articles: number; count: number; last: number }>();
    for (const c of commandes) {
      const cur = map.get(c.fournisseur) ?? { total: 0, articles: 0, count: 0, last: 0 };
      cur.total += c.coutTotal;
      cur.articles += c.nbArticles;
      cur.count += 1;
      cur.last = Math.max(cur.last, new Date(c.date).getTime());
      map.set(c.fournisseur, cur);
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, total: v.total, articles: v.articles, count: v.count, last: v.last, unit: v.articles > 0 ? v.total / v.articles : 0 }))
      .sort((a, b) => b.total - a.total);
  }, [commandes]);

  return (
    <Frame>

      {/* ── Grille haute : 1.4fr / 1fr, comme la maquette ─────────────── */}
      <section className="grid grid-cols-1 gap-3.5 min-[900px]:grid-cols-[1.4fr_1fr]">

        {/* Total investi — le chiffre héros de l'écran */}
        <Module className="p-[26px] shadow-pop">
          <Eyebrow>TOTAL INVESTI</Eyebrow>
          <div className="mt-2.5 whitespace-nowrap text-2xl font-bold leading-none tracking-[-0.045em] [font-variant-numeric:tabular-nums] min-[900px]:text-3xl">
            {euros(kpis.totalInvesti)}
          </div>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <Chip>
              {kpis.nbCommandes} COMMANDE{kpis.nbCommandes > 1 ? "S" : ""}
            </Chip>
            <Chip>PRIX UNITAIRE MOYEN {euros(kpis.prixUnitMoyen)}</Chip>
            <Chip accent>
              {kpis.totalArticles.toLocaleString("fr-FR")} PIÈCE
              {kpis.totalArticles > 1 ? "S" : ""}
            </Chip>
          </div>
          <Sparkline months={months} />
        </Module>

        {/* Colonne droite : ajout de pièces, puis répartition fournisseurs */}
        <div className="flex flex-col gap-3.5">
          <Module className="p-[22px]">
            <CardTitle className="mb-3">Ajouter des pièces</CardTitle>
            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => setNewCommande(true)}
                className="inline-flex min-h-12 items-center gap-2 rounded-md bg-accent px-[18px] text-left text-base font-semibold text-accent-ink transition-colors hover:bg-accent-hover"
              >
                <Plus className="h-4 w-4 flex-none" strokeWidth={2.3} />
                Créer une commande
              </button>
              <button
                onClick={() => toast.info("Import Excel — bientôt disponible.")}
                className="inline-flex min-h-12 items-center gap-2 rounded-md border border-line bg-surface-2 px-[18px] text-left text-base text-ink-2 transition-colors hover:border-line-strong"
              >
                <FileSpreadsheet className="h-4 w-4 flex-none" strokeWidth={2} />
                Importer un fichier Excel
              </button>
            </div>
            <div className="mt-3 font-mono text-xs uppercase leading-[1.6] tracking-[0.1em] text-ink-3">
              {derniereCommande
                ? `DERNIÈRE COMMANDE — ${dateFr(derniereCommande)} · ${kpis.totalArticles.toLocaleString("fr-FR")} PIÈCES AU TOTAL`
                : "AUCUNE COMMANDE ENREGISTRÉE"}
            </div>
          </Module>

          <Module className="flex-1 p-[22px]">
            <CardTitle className="mb-3">Par fournisseur</CardTitle>
            {suppliers.length === 0 ? (
              <p className="font-mono text-xs text-ink-3">
                Aucun fournisseur.
              </p>
            ) : (
              suppliers.map((f) => (
                <FournisseurLigne
                  key={f.name}
                  nom={f.name}
                  total={f.total}
                  part={suppliers[0].total > 0 ? f.total / suppliers[0].total : 0}
                  onClick={() => router.push("/stock")}
                />
              ))
            )}
          </Module>
        </div>
      </section>

      {/* ── Commandes récentes ─────────────────────────────────────────
          La maquette pose une vraie table à en-têtes mono. Le détail
          dépliable et le menu d'actions de l'ancienne liste sont conservés :
          la ligne reste cliquable, et le panneau s'ouvre dans une ligne qui
          couvre toute la largeur. */}
      <Module className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pb-3 pt-[18px]">
          <CardTitle className="">Commandes récentes</CardTitle>
          <span className="font-mono text-xs uppercase tracking-[0.1em] text-ink-3">
            {commandes.length} AU TOTAL
          </span>
        </div>

        {isLoading && (
          <div className="flex justify-center py-16">
            <Loader label="Chargement des commandes" />
          </div>
        )}
        {isError && (
          <p className="py-10 text-center font-mono text-xs text-neg">
            {(error as Error).message}
          </p>
        )}
        {!isLoading && !isError && commandes.length === 0 && (
          <p className="py-10 text-center font-mono text-xs text-ink-3">
            Aucune commande. Crée ta première commande !
          </p>
        )}

        {commandes.length > 0 && (
          <>
            {/* Desktop : table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] border-collapse [font-variant-numeric:tabular-nums]">
                <thead>
                  <tr className="bg-surface-2">
                    <Th className="pl-5">FOURNISSEUR</Th>
                    <Th>DATE</Th>
                    <Th align="right">PIÈCES</Th>
                    <Th align="right">MONTANT</Th>
                    <Th align="right">P.U. MOYEN</Th>
                    <Th align="center">RENTABILITÉ</Th>
                    <Th align="right" className="pr-5">
                      ACTIONS
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {commandes.map((c: CommandeDTO) => (
                    <CommandeTableRow
                      key={c.id}
                      c={c}
                      expanded={expandedId === c.id}
                      onToggle={() => toggleDetail(c.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile : cartes (CLAUDE.md — jamais de table sous 768 px) */}
            <div className="flex flex-col md:hidden">
              {commandes.map((c: CommandeDTO) => (
                <CommandeCarte
                  key={c.id}
                  c={c}
                  expanded={expandedId === c.id}
                  onToggle={() => toggleDetail(c.id)}
                />
              ))}
            </div>
          </>
        )}
      </Module>

      <NewCommandeModal open={newCommande} onClose={() => setNewCommande(false)} />
    </Frame>
  );
}
