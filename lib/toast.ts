import { toast } from "sonner";

/**
 * The app's three kinds of toast. Call these, never `toast()` directly, so
 * that durations stay consistent:
 * - success: 4 s;
 * - error: stays until closed (an error must not vanish before it is read);
 * - undoable: 5 s with an « Annuler » button.
 *
 * `id` deduplicates: a second toast with the same id replaces the first one.
 */
export function toastSucces(message: string, options?: { id?: string }): void {
  toast.success(message, { id: options?.id, duration: 4000 });
}

export function toastErreur(message: string, options?: { id?: string }): void {
  toast.error(message, { id: options?.id, duration: Infinity });
}

export function toastAnnulable(message: string, options: { onAnnuler: () => void; duree?: number }): void {
  toast(message, {
    duration: options.duree ?? 5000,
    action: { label: "Annuler", onClick: () => options.onAnnuler() },
  });
}
