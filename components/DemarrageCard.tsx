"use client";

// Rappel de démarrage, sur le Dashboard.
//
// Il remplace la modale de bienvenue, qui s'affichait une fois puis
// disparaissait pour toujours — y compris si l'utilisateur l'avait fermée sans
// rien configurer. Une carte reste visible tant que le parcours n'est pas fini,
// et s'efface d'elle-même ensuite. Rien à cocher, rien à fermer.

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { useReglages } from "@/lib/hooks";
import { Module } from "@/components/console";

// Trois étapes depuis le 15/08/2026. « Recevoir les événements » a disparu :
// le webhook s'enregistre tout seul quand le board est choisi.
const ETAPES = [
  "Connecter ton Trello",
  "Préparer le board",
  "Ta première commande",
];

export default function DemarrageCard() {
  const { data } = useReglages();
  if (!data || data.onboardingTermine) return null;

  const etape = Math.min(Math.max(data.onboardingEtape, 1), ETAPES.length);

  return (
    <Module className="p-[22px]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="font-mono text-xs uppercase tracking-[0.14em] text-ink-3">
            Configuration · étape {etape} sur {ETAPES.length}
          </div>
          <h2 className="mt-1.5 text-md font-bold tracking-[-0.01em] text-ink">
            {ETAPES[etape - 1]}
          </h2>
          <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-ink-3">
            Tant que Trello n&apos;est pas branché, la page « À comptabiliser »
            reste vide : rien ne remonte de tes cartes.
          </p>
        </div>
        <Link
          href="/demarrage"
          className="inline-flex min-h-[46px] flex-none items-center gap-2 rounded-md bg-accent px-5 text-base font-semibold text-accent-ink transition-colors hover:bg-accent-hover"
        >
          Reprendre
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <ol className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5">
        {ETAPES.map((e, i) => {
          const faite = i + 1 < etape;
          return (
            <li
              key={e}
              className={`flex items-center gap-1.5 text-xs ${
                faite
                  ? "text-pos"
                  : i + 1 === etape
                    ? "text-ink"
                    : "text-ink-3"
              }`}
            >
              {faite ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <span className="font-mono text-xs">{i + 1}</span>
              )}
              {e}
            </li>
          );
        })}
      </ol>
    </Module>
  );
}
