"use client";

import { useEffect, useState } from "react";
import { aujourdhuiParis } from "@/lib/dateMiseEnVente";
import { X } from "lucide-react";
import { CANAUX } from "@/lib/canalColors";
import { COMPTES_VENTE } from "@/lib/comptesVente";
import type { CompteVente } from "@/lib/types";

// Validation d'une vente : carte centrée (même structure que l'ancien modal
// clair) habillée aux couleurs de la barre de sélection du Stock — fond sombre
// #16261D, contrôles bg-white/10, action verte var(--pos).

// Jour calendaire à Paris : en UTC, une vente saisie entre minuit et 2 h
// serait pré-remplie à la veille.
function todayISO() {
  return aujourdhuiParis();
}

const LABEL = "mb-1.5 block text-[12.5px] font-semibold text-[#9FB2A7]";
const FIELD =
  "min-h-[44px] w-full rounded-xl border border-white/15 bg-white/10 px-3.5 text-[14px] font-semibold text-white outline-none transition-colors [color-scheme:dark] focus:border-white/35";

type Props = {
  open: boolean;
  sku?: string;
  defaultPrix?: number | null;
  defaultDate?: string | null;
  defaultCanal?: string | null;
  defaultCompteVente?: CompteVente | null;
  pending?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (
    prixVente: number,
    dateVenteISO: string,
    canal: string,
    compteVente: CompteVente,
  ) => void;
};

export default function SellDialog({
  open,
  sku,
  defaultPrix,
  defaultDate,
  defaultCanal,
  defaultCompteVente,
  pending,
  error,
  onClose,
  onConfirm,
}: Props) {
  const [prix, setPrix] = useState("");
  const [date, setDate] = useState(todayISO());
  const [canal, setCanal] = useState<string>("Vinted");
  const [compteVente, setCompteVente] = useState<CompteVente>("VINTED_PRO");

  useEffect(() => {
    if (!open) return;
    setPrix(defaultPrix != null ? String(defaultPrix) : "");
    setDate(defaultDate ? defaultDate.slice(0, 10) : todayISO());
    setCanal(defaultCanal || "Vinted");
    setCompteVente(defaultCompteVente || "VINTED_PRO");
  }, [open, sku, defaultPrix, defaultDate, defaultCanal, defaultCompteVente]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, onClose]);

  if (!open) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = Number(prix);
    if (!Number.isFinite(p) || p <= 0) return;
    onConfirm(p, new Date(date).toISOString(), canal, compteVente);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm [animation:overlayIn_.18s_ease-out_both]"
      onMouseDown={() => !pending && onClose()}
    >
      <form
        onSubmit={submit}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-[24px] bg-[#16261D] p-6 text-white shadow-[0_28px_60px_-20px_rgba(0,0,0,.7)] [animation:modalIn_.22s_cubic-bezier(.22,1,.36,1)_both]"
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="font-grotesk text-[20px] font-bold tracking-[-0.01em]">
            Vendre {sku ?? "l’article"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            aria-label="Fermer"
            className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#9FB2A7] transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            <X className="h-[18px] w-[18px]" strokeWidth={2.2} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className={LABEL} htmlFor="sell-prix">
              Prix de vente (€)
            </label>
            <input
              id="sell-prix"
              type="number"
              step="any"
              min="0"
              required
              autoFocus
              inputMode="decimal"
              value={prix}
              onChange={(e) => setPrix(e.target.value)}
              // Les flèches natives ressortent en gris clair sur le fond sombre.
              className={`${FIELD} [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
            />
          </div>

          <div>
            <label className={LABEL} htmlFor="sell-date">
              Date de vente
            </label>
            <input
              id="sell-date"
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={FIELD}
            />
          </div>

          <div>
            <label className={LABEL} htmlFor="sell-canal">
              Canal de vente
            </label>
            <select
              id="sell-canal"
              value={canal}
              onChange={(e) => setCanal(e.target.value)}
              className={`${FIELD} cursor-pointer`}
            >
              {CANAUX.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={LABEL} htmlFor="sell-compte">
              Compte de vente
            </label>
            <select
              id="sell-compte"
              value={compteVente}
              onChange={(e) => setCompteVente(e.target.value as CompteVente)}
              className={`${FIELD} cursor-pointer`}
            >
              {COMPTES_VENTE.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <p className="mt-4 text-[13px] font-medium text-[#F5B7A0]">{error}</p>
        )}

        <div className="mt-6 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="min-h-[44px] rounded-full border border-white/15 px-5 text-[13.5px] font-semibold text-[#9FB2A7] transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={pending}
            className="min-h-[44px] rounded-full bg-[var(--pos)] px-5 text-[13.5px] font-bold text-[var(--acc-ink)] transition-colors hover:bg-[var(--acc-hover)] disabled:opacity-60"
          >
            {pending ? "Validation…" : "Confirmer la vente"}
          </button>
        </div>
      </form>
    </div>
  );
}
