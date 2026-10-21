"use client";

import { useSyncExternalStore } from "react";

const REQUETE = "(prefers-reduced-motion: reduce)";

function abonner(rappel: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(REQUETE);
  mq.addEventListener("change", rappel);
  return () => mq.removeEventListener("change", rappel);
}

const instantane = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(REQUETE).matches : false);

/**
 * True when the user asked the system to reduce motion. Server snapshot:
 * false (CSS `motion-safe:` already covers the first paint).
 */
export function useMouvementReduit(): boolean {
  return useSyncExternalStore(abonner, instantane, () => false);
}
