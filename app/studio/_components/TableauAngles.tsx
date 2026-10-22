"use client";

import Link from "next/link";
import { Eye, Lock } from "lucide-react";

import { Button, IconButton } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { pluriel } from "@/lib/format";
import { cleCase, nomPrise, type EtatCase } from "@/lib/studioCases";

import type { FicheClient } from "./Fiche";
import { SectionEtape } from "./SectionEtape";
import type { ChoixCases } from "./useParcours";

const num = (o: number) => String(o).padStart(2, "0");

/**
 * Step 2, the angles: one row per real photo, one column per angle prompt. A
 * free cell is picked with a click; a generated, validated or listed cell
 * is locked. No shot selector here any more: shots are arranged on the
 * board (step 1) only.
 */
export default function TableauAngles({
  fiche,
  cible,
  choix,
  onApercu,
  numero,
  ouverte,
  courante,
  onBasculer,
}: {
  fiche: FicheClient;
  cible: string | null;
  choix: ChoixCases;
  onApercu: (angleId: string) => void;
  numero: number;
  ouverte: boolean;
  courante: boolean;
  onBasculer: () => void;
}) {
  const { lignes, angles } = fiche;
  const { etats } = choix;

  // Rejections per cell: a rejected image frees its cell but leaves a trace.
  const rejets = new Map<string, number>();
  for (const e of fiche.essais) {
    if (e.decision !== "rejete") continue;
    const k = cleCase(e.referenceId, e.angleId);
    rejets.set(k, (rejets.get(k) ?? 0) + 1);
  }

  const usage = (angleId: string) => {
    const colonne = lignes.map((l) => etats.get(cleCase(l.id, angleId)));
    const vente = colonne.flatMap((e) => (e?.kind === "vente" ? [e.sku] : []));
    const prises = colonne.filter((e) => e && e.kind !== "libre").length;
    if (vente.length > 0) return `${vente.length} en vente`;
    if (prises > 0) return pluriel(prises, "case prise", "cases prises");
    return "jamais utilisée";
  };

  const resume = !cible
    ? "aucun sac à préparer"
    : angles.length === 0
      ? "aucun prompt d’angle"
      : `${pluriel(choix.choisies.length, "variante choisie", "variantes choisies")} pour ${cible}${choix.estManuel ? " · choix manuel" : " · choix automatique"}`;

  const grille = { gridTemplateColumns: `minmax(150px,180px) repeat(${Math.max(angles.length, 1)}, minmax(96px, 1fr))` };

  return (
    <SectionEtape etape="angles" numero={numero} titre="Angles" resume={resume} ouverte={ouverte} courante={courante} onBasculer={onBasculer}>
      {lignes.length === 0 ? (
        <p className="text-base text-ink-2">Le tableau apparaît dès que les vraies photos sont sur la planche.</p>
      ) : angles.length === 0 ? (
        <p className="text-base text-ink-2">
          Aucun prompt d’angle.{" "}
          <Link href="/parametres?onglet=studio" className="font-semibold text-ink underline underline-offset-2">
            Ajoute-les dans les Réglages du Studio
          </Link>
          .
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="min-w-0 max-w-[65ch] flex-1 text-base text-ink-2">
              Une ligne par vraie photo, une colonne par prompt d’angle. Clique une case libre pour la choisir : une case déjà générée,
              validée ou en vente ne se choisit plus.
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={!cible} onClick={choix.automatique}>
                Choisir automatiquement
              </Button>
              <Button variant="ghost" size="sm" disabled={!cible} onClick={choix.toutDecocher}>
                Tout décocher
              </Button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink-2">
            <Legende cls="border-line-strong bg-surface-2" texte="En vente (verrouillée)" />
            <Legende cls="border-pos bg-pos-soft" texte={cible ? `Validée (pour ${cible} ou un autre sac)` : "Validée"} />
            <Legende cls="border-warn bg-warn-soft" texte="Générée, à juger" />
            <Legende cls="border-accent bg-accent-soft" texte="Choisie" />
            <Legende cls="border-line-strong bg-surface" texte="Libre" />
          </div>

          <div className="mt-4 overflow-x-auto">
            <div className="min-w-max" role="table" aria-label="Photos × prompts d’angle">
              <div className="grid items-end gap-1.5 border-b border-line pb-2" style={grille} role="row">
                <span className="font-mono text-xs tracking-[0.14em] text-ink-2" role="columnheader">
                  VRAIE PHOTO
                </span>
                {angles.map((a) => (
                  <div key={a.id} role="columnheader" className="flex min-w-0 items-start gap-1 px-1">
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 text-sm font-semibold leading-snug text-ink">{a.nom}</div>
                      <div className="truncate text-xs text-ink-2">{usage(a.id)}</div>
                    </div>
                    <IconButton label={`Aperçu du prompt « ${a.nom} »`} size="sm" className="h-7 w-7 md:h-7 md:w-7" onClick={() => onApercu(a.id)}>
                      <Eye size={14} aria-hidden />
                    </IconButton>
                  </div>
                ))}
              </div>
              {lignes.map((l) => (
                <div key={l.id} className="grid items-center gap-1.5 border-b border-line py-1.5" style={grille} role="row">
                  <div className="flex min-w-0 items-center gap-2.5" role="rowheader">
                    <div className="h-[52px] w-[39px] flex-none overflow-hidden rounded-xs border border-line">
                      {/* eslint-disable-next-line @next/next/no-img-element -- image privée servie par /api/studio/image */}
                      <img src={`/api/studio/image?ref=${l.id}`} alt="" loading="lazy" className="h-full w-full object-cover" />
                    </div>
                    <span className="min-w-0 text-sm leading-snug text-ink">
                      <span className="font-mono text-xs text-ink-2">{num(l.ordre)} </span>
                      <span className="line-clamp-2 font-medium">{l.prise ?? nomPrise(l.ordre, fiche.generation)}</span>
                    </span>
                  </div>
                  {angles.map((a) => (
                    <Case
                      key={a.id}
                      etat={etats.get(cleCase(l.id, a.id))}
                      cible={cible}
                      rejets={rejets.get(cleCase(l.id, a.id)) ?? 0}
                      choisie={choix.choixDe(l.id) === a.id}
                      libelle={`${l.prise ?? nomPrise(l.ordre, fiche.generation)} × ${a.nom}`}
                      onChoisir={() => choix.basculer(l.id, a.id)}
                      choisissable={!!cible}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </SectionEtape>
  );
}

function Legende({ cls, texte }: { cls: string; texte: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-3 w-3 rounded-xs border", cls)} aria-hidden="true" />
      {texte}
    </span>
  );
}

function Case({
  etat,
  cible,
  rejets,
  choisie,
  libelle,
  onChoisir,
  choisissable,
}: {
  etat: EtatCase | undefined;
  cible: string | null;
  rejets: number;
  choisie: boolean;
  libelle: string;
  onChoisir: () => void;
  choisissable: boolean;
}) {
  const base = "flex h-11 w-full items-center justify-center gap-1.5 rounded-sm border px-1 text-sm font-semibold";
  if (!etat || etat.kind === "libre") {
    const trace = rejets > 0 ? ` · ${pluriel(rejets, "rejet", "rejets")}` : "";
    return (
      <div role="cell">
        <button
          type="button"
          aria-pressed={choisie}
          aria-label={`${choisie ? "Choisie" : "Libre"}${trace} — ${libelle}`}
          disabled={!choisissable}
          onClick={onChoisir}
          className={cn(
            base,
            "transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed",
            choisie ? "border-accent bg-accent-soft font-bold text-ink" : "border-line bg-surface font-medium text-ink-2 enabled:hover:border-line-strong",
          )}
        >
          <span
            className={cn("h-3.5 w-3.5 flex-none rounded-full border-2", choisie ? "border-accent bg-accent" : "border-line-strong bg-surface")}
            aria-hidden="true"
          />
          <span className="truncate">
            {choisie ? "Choisie" : "Libre"}
            {rejets > 0 && <span className="font-normal text-ink-2">{` · ${rejets} rejet${rejets > 1 ? "s" : ""}`}</span>}
          </span>
        </button>
      </div>
    );
  }
  if (etat.kind === "vente") {
    return (
      <div role="cell" aria-label={`En vente (${etat.sku}) — ${libelle}`} className={cn(base, "border-line-strong bg-surface-2 text-ink-2")}>
        <Lock size={12} aria-hidden="true" />
        <span className="font-mono">{etat.sku}</span>
      </div>
    );
  }
  if (etat.kind === "validee") {
    return (
      <div role="cell" aria-label={`Validée${etat.sku ? ` pour ${etat.sku}` : ""} — ${libelle}`} className={cn(base, "border-pos bg-pos-soft text-pos")}>
        <span className="truncate">Validée{etat.sku && etat.sku !== cible ? ` · ${etat.sku}` : ""}</span>
      </div>
    );
  }
  return (
    <div role="cell" aria-label={`À juger — ${libelle}`} className={cn(base, "border-warn bg-warn-soft text-ink")}>
      <span className="h-[7px] w-[7px] flex-none rounded-full bg-warn" aria-hidden="true" />À juger
    </div>
  );
}
