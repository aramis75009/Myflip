"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { toastErreur, toastSucces } from "@/lib/toast";
import {
  BUDGET_EUR_MAX,
  PRISES_PAR_SAC,
  TAUX_EUR_PAR_USD_MAX,
  TAUX_EUR_PAR_USD_MIN,
  eurEnUsd,
  formatEur,
  formatUsd,
  type BudgetCompte,
} from "@/lib/studioModeles";

// Budget per bag and dollar rate of the Studio (PUT /api/studio/reglages):
// the form lives here once, shown in the « Studio » tab of /parametres and in
// the Studio's generation step. The server re-reads both at every launch.

/** « 1,5 », « 1.50 », « 1 000 » → number; anything else → null. */
export function lireNombreSaisi(s: string): number | null {
  const propre = s.trim().replace(/[\s  ]/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(propre)) return null;
  const n = Number(propre);
  return Number.isFinite(n) ? n : null;
}

const enTexte = (n: number) => String(n).replace(".", ",");

/** Field errors, the same bounds as the server (lib/studioModeles.ts, lireBudgetSaisi). */
function verifier(budget: string, taux: string): { budget?: string; taux?: string; valeurs?: BudgetCompte } {
  const b = lireNombreSaisi(budget);
  const t = lireNombreSaisi(taux);
  const erreurs: { budget?: string; taux?: string } = {};
  if (b === null || b < 0.01 || b > BUDGET_EUR_MAX) erreurs.budget = `Un montant entre 0,01 € et ${BUDGET_EUR_MAX} €.`;
  if (t === null || t < TAUX_EUR_PAR_USD_MIN || t > TAUX_EUR_PAR_USD_MAX) {
    erreurs.taux = `Entre ${enTexte(TAUX_EUR_PAR_USD_MIN)} et ${TAUX_EUR_PAR_USD_MAX} € pour 1 $.`;
  }
  if (erreurs.budget || erreurs.taux || b === null || t === null) return erreurs;
  return { valeurs: { budgetParSacEur: Math.round(b * 100) / 100, tauxEurParUsd: Math.round(t * 1e4) / 1e4 } };
}

export function ReglageBudget({
  initial,
  onEnregistre,
  empile = false,
}: {
  initial: BudgetCompte;
  onEnregistre?: (b: BudgetCompte) => void;
  /** One field under the other (narrow popover). */
  empile?: boolean;
}) {
  const [budget, setBudget] = useState(() => enTexte(initial.budgetParSacEur));
  const [taux, setTaux] = useState(() => enTexte(initial.tauxEurParUsd));
  const [erreurs, setErreurs] = useState<{ budget?: string; taux?: string }>({});
  const [enCours, setEnCours] = useState(false);

  // The saved values changed elsewhere (another tab of the page): follow them while nothing is typed.
  useEffect(() => {
    setBudget(enTexte(initial.budgetParSacEur));
    setTaux(enTexte(initial.tauxEurParUsd));
  }, [initial.budgetParSacEur, initial.tauxEurParUsd]);

  const lu = verifier(budget, taux).valeurs;
  const budgetUsd = lu ? eurEnUsd(lu.budgetParSacEur, lu.tauxEurParUsd) : null;

  async function enregistrer(e: FormEvent) {
    e.preventDefault();
    const v = verifier(budget, taux);
    setErreurs({ budget: v.budget, taux: v.taux });
    if (!v.valeurs || enCours) return;
    setEnCours(true);
    try {
      const res = await fetch("/api/studio/reglages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v.valeurs),
      });
      const j = (await res.json().catch(() => null)) as (Partial<BudgetCompte> & { error?: string }) | null;
      if (!res.ok || typeof j?.budgetParSacEur !== "number" || typeof j.tauxEurParUsd !== "number") {
        throw new Error(j?.error ?? `Erreur ${res.status}`);
      }
      const enregistre = { budgetParSacEur: j.budgetParSacEur, tauxEurParUsd: j.tauxEurParUsd };
      toastSucces(`Budget enregistré : ${formatEur(enregistre.budgetParSacEur)} par sac, ${enTexte(enregistre.tauxEurParUsd)} € pour 1 $.`);
      onEnregistre?.(enregistre);
    } catch (err) {
      toastErreur(`Budget non enregistré : ${err instanceof Error ? err.message : "connexion perdue"}`);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <form onSubmit={(e) => void enregistrer(e)} className="flex flex-col gap-4" aria-label="Budget du Studio" noValidate>
      <div className={empile ? "flex flex-col gap-4" : "grid gap-4 md:grid-cols-2"}>
        <Field label={`Budget par sac (${PRISES_PAR_SAC} prises)`} hint="En euros. Au-delà, un lancement demande confirmation." error={erreurs.budget}>
          <Input
            inputMode="decimal"
            autoComplete="off"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            className="font-mono tabular-nums"
          />
        </Field>
        <Field label="Taux € pour 1 $" hint="OpenRouter facture en dollars. Aucun service de change n’est interrogé." error={erreurs.taux}>
          <Input
            inputMode="decimal"
            autoComplete="off"
            value={taux}
            onChange={(e) => setTaux(e.target.value)}
            className="font-mono tabular-nums"
          />
        </Field>
      </div>
      <p className="text-sm text-ink-2" aria-live="polite">
        {lu && budgetUsd !== null ? (
          <>
            Soit <strong className="font-mono font-semibold text-ink">{formatUsd(budgetUsd)}</strong> chez OpenRouter pour un sac, environ{" "}
            <span className="font-mono">{formatUsd(budgetUsd / PRISES_PAR_SAC)}</span> par image.
          </>
        ) : (
          "Saisis un budget et un taux pour voir l’équivalent en dollars."
        )}
      </p>
      <div>
        <Button type="submit" pending={enCours} pendingLabel="Enregistrement…">
          Enregistrer le budget
        </Button>
      </div>
    </form>
  );
}

/** The « Budget » card of the Studio tab of /parametres. */
export default function BudgetStudio({ budget }: { budget: BudgetCompte }) {
  const qc = useQueryClient();
  return (
    <Panel titre="Budget par sac" aside="comparé à chaque lancement, côté serveur aussi">
      <p className="mb-4 max-w-[70ch] text-base text-ink-2">
        Le coût estimé d’un lancement est comparé à ce budget avant de partir. Au-delà, ou si un prix n’est pas publié, le Studio te
        demande de confirmer en affichant le montant.
      </p>
      <ReglageBudget initial={budget} onEnregistre={() => void qc.invalidateQueries({ queryKey: ["studio-prompts"] })} />
    </Panel>
  );
}
