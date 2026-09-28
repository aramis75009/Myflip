"use client";

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
          <label className="mb-1.5 block text-label-sm text-ink-muted">
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
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-body-md text-ink outline-none focus:border-primary focus:ring-2 focus:ring-[var(--acc-ring)]"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-label-sm text-ink-muted">
            Date de vente
          </label>
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-body-md text-ink outline-none focus:border-primary focus:ring-2 focus:ring-[var(--acc-ring)]"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-label-sm text-ink-muted">
            Canal de vente
          </label>
          <select
            value={canal}
            onChange={(e) => setCanal(e.target.value)}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-body-md text-ink outline-none focus:border-primary focus:ring-2 focus:ring-[var(--acc-ring)]"
          >
            {CANAUX.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        {error && <p className="text-body-md text-error">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-line px-5 py-2 text-body-md font-medium text-ink-muted transition-colors hover:bg-surface-container"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-primary px-5 py-2 text-body-md font-medium text-on-primary transition-colors hover:bg-primary-dark disabled:opacity-60"
          >
            {pending ? "Validation…" : "Confirmer la vente"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
