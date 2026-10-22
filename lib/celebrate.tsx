import { Check } from "lucide-react";
import { toast } from "sonner";

import { euros } from "./calc";
import { signedEur } from "./format";

// Celebration of a sale: a burst of confetti + a toast with the amount cashed
// in and the net margin. Called from the success of a sale.
//
// The confetti fly over the page background, in both themes: they take the
// accent, success, warning and three mid-tone status colours of
// app/tokens.css, read at burst time (so they follow the current theme).
const COULEURS = [
  "rgb(var(--accent))",
  "rgb(var(--pos))",
  "rgb(var(--warn))",
  "rgb(var(--st-photos))",
  "rgb(var(--st-vente))",
  "rgb(var(--st-lavage))",
];

function mouvementReduit(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** Small DOM firework, no dependency. Cleaned up after the animation. */
export function burstConfetti() {
  if (typeof document === "undefined" || mouvementReduit()) return;
  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:var(--z-toast);overflow:hidden";
  document.body.appendChild(layer);

  const N = 42;
  for (let i = 0; i < N; i++) {
    const ang = (Math.PI * 2 * i) / N + (Math.random() - 0.5);
    const dist = 140 + Math.random() * 190;
    const sz = 7 + Math.random() * 8;
    const p = document.createElement("span");
    p.style.cssText = [
      "position:absolute",
      "left:50%",
      "top:42%",
      `width:${sz}px`,
      `height:${(sz * (Math.random() > 0.5 ? 1 : 0.5)).toFixed(1)}px`,
      `border-radius:${Math.random() > 0.5 ? "var(--r-full)" : "var(--r-xs)"}`,
      `background:${COULEURS[i % COULEURS.length]}`,
    ].join(";");
    p.style.setProperty("--tx", `${(Math.cos(ang) * dist).toFixed(1)}px`);
    p.style.setProperty("--ty", `${(Math.sin(ang) * dist - 40).toFixed(1)}px`);
    p.style.setProperty("--rot", `${(Math.random() * 720 - 360).toFixed(0)}deg`);
    p.style.animationName = "confettiFly";
    p.style.animationDuration = `${(0.9 + Math.random() * 0.6).toFixed(2)}s`;
    p.style.animationTimingFunction = "var(--ease-out)";
    p.style.animationFillMode = "forwards";
    layer.appendChild(p);
  }
  setTimeout(() => layer.remove(), 1800);
}

/**
 * Confetti + « Article vendu 🎉 » toast with the amount cashed in and the
 * signed net margin. No confetti for a sale at a loss, nor under
 * prefers-reduced-motion.
 */
export function celebrateSale(ca: number | null, margeNette: number | null) {
  if (margeNette == null || margeNette >= 0) burstConfetti();
  toast.custom(
    () => (
      <div className="flex min-w-[232px] items-center gap-3 rounded-md border border-line bg-surface px-4 py-3 text-ink shadow-over">
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-pos-soft text-pos">
          <Check aria-hidden className="h-4 w-4" strokeWidth={3} />
        </span>
        <div>
          <div className="text-base font-bold">Article vendu 🎉</div>
          <div className="mt-px text-xs text-ink-2">
            {ca != null ? `+${euros(ca)}` : ""}
            {margeNette != null ? ` · marge ${signedEur(margeNette)}` : ""}
          </div>
        </div>
      </div>
    ),
    { duration: 3200 },
  );
}
