"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Camera, CheckCheck, ChevronDown, Eye, LayoutGrid, Save, Scale, Settings2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import { toastErreur, toastSucces } from "@/lib/toast";
import { detailsEnLignes } from "@/lib/studioAngles";

import { CLE_RETOUR_CATALOGUE, ETAPES, type Etape, type ProchaineAction } from "../_parcours";
import { lireErreur } from "./envoi";
import type { FicheClient } from "./Fiche";

// The top of a colourway sheet: identity and target bag, then the NEXT ACTION
// card with the five steps in work order.

const STATUT_LIBELLE: Record<string, string> = {
  "En stock": "photos à préparer",
  "Photos prêtes": "photos prêtes",
  "En vente": "en vente",
  Vendu: "vendu",
};

const ICONES: Record<Etape, typeof Camera> = {
  photos: Camera,
  angles: LayoutGrid,
  generation: Sparkles,
  "a-juger": Scale,
  validees: CheckCheck,
};

export const NOMS_ETAPES: Record<Etape, string> = {
  photos: "Photos",
  angles: "Angles",
  generation: "Génération",
  "a-juger": "À juger",
  validees: "Validées",
};

// ── Header ──────────────────────────────────────────────────────────────────

export function EnTete({
  fiche,
  cible,
  onCible,
  onApercu,
}: {
  fiche: FicheClient;
  cible: string | null;
  onCible: (sku: string) => void;
  onApercu: () => void;
}) {
  const { coloris } = fiche;
  // The catalogue with the filters Aramis left it with (sessionStorage, read after mount).
  const [retour, setRetour] = useState("/studio");
  useEffect(() => {
    try {
      const q = window.sessionStorage.getItem(CLE_RETOUR_CATALOGUE);
      if (q) setRetour(`/studio?${q}`);
    } catch {
      // Storage unavailable: plain catalogue.
    }
  }, []);

  return (
    <header className="flex flex-col gap-3 rounded-lg border border-line bg-surface px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex h-[76px] w-[60px] flex-none items-center justify-center overflow-hidden rounded-md border border-line bg-surface-2">
          {fiche.vignette ? (
            // eslint-disable-next-line @next/next/no-img-element -- relais privé /api/studio/vignette
            <img src={fiche.vignette} alt={`Vignette SacBase ${coloris.coloris}`} className="h-[68px] w-auto object-contain" />
          ) : (
            <span className="px-1 text-center font-mono text-xs text-ink-2">{coloris.modele}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              href={retour}
              className="inline-flex items-center gap-1 rounded-xs text-sm font-semibold text-ink-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <ArrowLeft size={14} aria-hidden /> Tous les coloris
            </Link>
            <span aria-hidden="true" className="text-ink-3">
              /
            </span>
            <span className="font-mono text-xs tracking-[0.14em] text-ink-2">
              {[fiche.generation, coloris.modele, coloris.cle].filter(Boolean).join(" · ")}
            </span>
          </div>
          <h1 className="mt-1 text-xl font-bold tracking-[-0.02em] text-ink">{coloris.coloris || coloris.cle}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={onApercu} disabled={fiche.angles.length === 0}>
            <Eye size={15} aria-hidden /> Aperçu du prompt
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/parametres?onglet=studio">
              <Settings2 size={15} aria-hidden /> Réglages du Studio
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
        {fiche.sacs.length === 0 ? (
          <span className="text-sm font-semibold text-ink">Hors catalogue SacBase</span>
        ) : (
          <span className="mr-1 text-sm text-ink-2">{fiche.cibles.length > 0 ? "Préparer pour" : "Sacs"}</span>
        )}
        {fiche.sacs.map((s) => {
          const estCible = s.sku === cible;
          const choisissable = fiche.cibles.includes(s.sku);
          return (
            <button
              key={s.sku}
              type="button"
              disabled={!choisissable}
              aria-pressed={estCible}
              onClick={() => onCible(s.sku)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors duration-fast disabled:cursor-default",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                estCible ? "border-accent bg-accent-soft font-semibold text-ink" : "border-line bg-surface text-ink-2 enabled:hover:border-line-strong",
              )}
            >
              <span className="font-mono font-bold text-ink">{s.sku}</span>
              {STATUT_LIBELLE[s.statut] ?? s.statut.toLowerCase()}
            </button>
          );
        })}
        <DetailsVerifies cle={coloris.cle} details={coloris.details} />
      </div>
    </header>
  );
}

// ── Next action ─────────────────────────────────────────────────────────────

export function CarteProchaineAction({
  action,
  resumes,
  onOuvrir,
}: {
  action: ProchaineAction;
  resumes: Record<Etape, string>;
  onOuvrir: (e: Etape) => void;
}) {
  const Icone = ICONES[action.etape];
  return (
    <section aria-labelledby="prochaine-action" className="overflow-hidden rounded-lg border border-line-strong bg-surface">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4">
        <span aria-hidden="true" className="flex h-12 w-12 flex-none items-center justify-center rounded-md bg-accent text-accent-ink">
          <Icone size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-xs tracking-[0.14em] text-ink-2">PROCHAINE ACTION</div>
          <p id="prochaine-action" className="mt-0.5 text-xl font-bold tracking-[-0.02em] text-ink">
            {action.titre}
          </p>
          <p className="mt-1 max-w-[65ch] text-base text-ink-2">{action.detail}</p>
        </div>
        {action.reglages ? (
          <Button asChild size="lg">
            <Link href="/parametres?onglet=studio">
              {action.bouton} <ArrowRight size={16} aria-hidden />
            </Link>
          </Button>
        ) : (
          <Button size="lg" onClick={() => onOuvrir(action.etape)}>
            {action.bouton} <ArrowRight size={16} aria-hidden />
          </Button>
        )}
      </div>
      <ol aria-label="Étapes du coloris" className="flex flex-wrap border-t border-line bg-surface-2 px-3 py-2">
        {ETAPES.map((e, i) => {
          const actuelle = e === action.etape;
          return (
            <li key={e} className="flex items-center">
              {i > 0 && <span aria-hidden="true" className="mx-1 h-px w-4 bg-line-strong" />}
              <button
                type="button"
                aria-current={actuelle ? "step" : undefined}
                onClick={() => onOuvrir(e)}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-full px-2.5 text-sm transition-colors duration-fast hover:bg-surface",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                  actuelle ? "font-semibold text-ink" : "text-ink-2",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full font-mono text-xs font-bold",
                    actuelle ? "bg-accent text-accent-ink" : "bg-surface text-ink-2",
                  )}
                >
                  {i + 1}
                </span>
                {NOMS_ETAPES[e]}
                <span className="font-mono text-xs text-ink-2">{resumes[e]}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// ── Details checked by the AI ───────────────────────────────────────────────

/** Details the AI opinion checks, one per line. Folded: they only serve the check. */
function DetailsVerifies({ cle, details }: { cle: string; details: string }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [texte, setTexte] = useState(details);
  const [envoi, setEnvoi] = useState(false);
  const n = detailsEnLignes(details).length;

  async function enregistrer() {
    if (texte === details || envoi) return;
    setEnvoi(true);
    try {
      const res = await fetch(`/api/studio/coloris/${encodeURIComponent(cle)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ details: texte }),
      });
      if (!res.ok) toastErreur(await lireErreur(res));
      else toastSucces("Détails enregistrés : ils serviront au prochain avis IA.");
      router.refresh();
    } catch {
      toastErreur("Connexion perdue : réessaie.");
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <>
      <button
        type="button"
        aria-expanded={ouvert}
        onClick={() => setOuvert((o) => !o)}
        className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-sm text-sm font-semibold text-ink-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <ChevronDown size={15} aria-hidden className={cn("transition-transform duration-fast", !ouvert && "-rotate-90")} />
        Détails vérifiés par l’IA <span className="font-mono text-xs font-medium">{n}</span>
      </button>
      {ouvert && (
        <div className="flex basis-full flex-col gap-2 pt-2">
          <p className="text-sm text-ink-2">Un par ligne. L’avis IA contrôle chacun sur l’image générée ; ils ne partent pas dans le prompt.</p>
          <Textarea
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            rows={4}
            aria-label="Détails vérifiés par l’IA"
            placeholder={"patch ELITE côté gauche\nswoosh blanc cassé\nzip noir mat"}
            className="max-w-2xl font-mono text-sm"
          />
          <div>
            <Button variant="secondary" size="sm" disabled={texte === details} pending={envoi} pendingLabel="Enregistrement…" onClick={() => void enregistrer()}>
              <Save size={14} aria-hidden /> Enregistrer
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
