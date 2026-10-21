"use client";

import { FenetreModale, type FenetreProps } from "./dialog";

/**
 * Sheet: same mechanics as Dialog (focus trap, veil, Escape, dirty /
 * pending), stuck to the bottom of the screen, or to the right on desktop
 * (`side="droite"`, 440 px).
 */
export function Sheet({ side = "bas", ...props }: FenetreProps & { side?: "bas" | "droite" }) {
  return <FenetreModale {...props} placement={side} />;
}
