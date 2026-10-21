"use client";
// design-tokens-dette: R13 → L3

import { useEffect, useState } from "react";
import { aujourdhuiParis } from "@/lib/dateMiseEnVente";
import Modal from "./Modal";
import { CANAUX } from "@/lib/canalColors";

// Jour calendaire à Paris : en UTC, une vente saisie entre minuit et 2 h
// serait pré-remplie à la veille.
function todayISO() {
  return aujourdhuiParis();
}

export default function SellModal({
  open,
  sku,
  defaultPrix,
  defaultDate,
  defaultCanal,
  pending,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  sku?: string;
  defaultPrix?: number | null;
  defaultDate?: string | null;
  defaultCanal?: string | null;
  pending?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (prixVente: number, dateVenteISO: string, canal: string) => void;
}) {
  const [prix, setPrix] = useState("");
  const [date, setDate] = useState(todayISO());
  const [canal, setCanal] = useState<string>("Vinted");

  useEffect(() => {
    if (open) {
      setPrix(defaultPrix != null ? String(defaultPrix) : "");
      setDate(defaultDate ? defaultDate.slice(0, 10) : todayISO());
      setCanal(defaultCanal || "Vinted");
    }
  }, [open, defaultPrix, defaultDate, defaultCanal]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = Number(prix);
    if (!Number.isFinite(p) || p <= 0) return;
    onConfirm(p, new Date(date).toISOString(), canal);
  };

  return (
    <Modal open={open} onClose={onClose} title={`Vendre ${sku ?? "l'article"}`}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-2">
            Prix de vente (€)
          </label>
          <input
            type="number"
            step="any"
            min="0"
            required
            autoFocus
            value={prix}
            onChange={(e) => setPrix(e.target.value)}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-base text-ink outline-none focus:border-accent focus:ring-2 focus:ring-focus"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-2">
            Date de vente
          </label>
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-base text-ink outline-none focus:border-accent focus:ring-2 focus:ring-focus"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-2">
            Canal de vente
          </label>
          <select
            value={canal}
            onChange={(e) => setCanal(e.target.value)}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-base text-ink outline-none focus:border-accent focus:ring-2 focus:ring-focus"
          >
            {CANAUX.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        {error && <p className="text-base text-neg">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-line px-5 py-2 text-base font-medium text-ink-2 transition-colors hover:bg-surface-2"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-accent px-5 py-2 text-base font-medium text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {pending ? "Validation…" : "Confirmer la vente"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
