"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Copy, Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
import { promptVariante } from "@/lib/studioCases";

import { copier } from "./lancer";

type Angle = { id: string; nom: string; angle: string };

/**
 * The prompt EXACTLY as it leaves: `promptVariante(maître, angle)`, the same
 * function the generation route and the manual deposit use. Shown in its two
 * parts (master first, then angle), copied as one text.
 */
export default function ApercuPrompt({
  open,
  onOpenChange,
  promptMaitre,
  angles,
  angleInitial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  promptMaitre: string;
  angles: readonly Angle[];
  angleInitial: string | null;
}) {
  const [angleId, setAngleId] = useState<string | null>(angleInitial);
  useEffect(() => {
    if (open) setAngleId(angleInitial ?? angles[0]?.id ?? null);
  }, [open, angleInitial, angles]);

  const angle = angles.find((a) => a.id === angleId) ?? angles[0] ?? null;
  const texte = angle ? promptVariante(promptMaitre, angle.angle) : "";
  const maitre = promptMaitre.trim();

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Aperçu du prompt"
      description="Le texte envoyé au modèle avec la vraie photo, mot pour mot."
      footer={
        <>
          <Button asChild variant="ghost">
            <Link href="/parametres?onglet=studio">
              <Settings2 size={15} aria-hidden /> Modifier dans les Réglages
            </Link>
          </Button>
          <Button variant="primary" disabled={!texte} onClick={() => void copier(texte, "Prompt")}>
            <Copy size={15} aria-hidden /> Copier le texte exact
          </Button>
        </>
      }
    >
      {angles.length === 0 ? (
        <p className="text-base text-ink-2">Aucun prompt d’angle : ajoute-les dans les Réglages du Studio.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div role="group" aria-label="Prompt d’angle" className="flex flex-wrap gap-1.5">
            {angles.map((a) => {
              const actif = a.id === angle?.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  aria-pressed={actif}
                  onClick={() => setAngleId(a.id)}
                  className={cn(
                    "inline-flex h-9 items-center rounded-full border px-3 text-sm transition-colors duration-fast",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                    actif ? "border-accent bg-accent-soft font-semibold text-ink" : "border-line bg-surface text-ink-2 hover:border-line-strong",
                  )}
                >
                  {a.nom}
                </button>
              );
            })}
          </div>

          <div className="overflow-hidden rounded-md border border-line-strong">
            <Partie numero={1} titre="Prompt maître" note="en tête de chaque appel">
              {maitre ? maitre : <span className="font-sans text-ink-2">Pas de prompt maître : seul le prompt d’angle part.</span>}
            </Partie>
            <Partie numero={2} titre="Prompt d’angle" note={angle?.nom ?? ""} separe>
              {angle?.angle.trim()}
            </Partie>
          </div>

          <p className="text-sm text-ink-2">
            Par API, ce texte part tel quel avec la vraie photo de la ligne. À la main dans Gemini, le prompt maître se colle une fois par
            conversation, puis chaque photo avec son prompt d’angle. Une correction ajoute ses propres consignes.
          </p>
        </div>
      )}
    </Dialog>
  );
}

function Partie({
  numero,
  titre,
  note,
  separe = false,
  children,
}: {
  numero: number;
  titre: string;
  note: string;
  separe?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn("bg-surface-2", separe && "border-t border-dashed border-line-strong")}>
      <div className="flex items-baseline gap-2 px-4 pt-3 font-mono text-xs tracking-[0.14em] text-ink-2">
        <span className="font-bold text-ink">{numero}</span>
        {titre.toUpperCase()}
        <span className="tracking-normal">· {note}</span>
      </div>
      <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words px-4 pb-3 pt-1.5 font-mono text-sm leading-relaxed text-ink">{children}</pre>
    </div>
  );
}
