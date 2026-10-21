"use client";
// design-tokens-dette: R14 → L1

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Modale de l'application.
 *
 * Trois zones en colonne : un en-tête figé, un corps qui défile, un pied
 * optionnel qui porte les actions.
 *
 * Ce découpage corrige un défaut de fond : le panneau était simplement centré,
 * sans hauteur maximale ni défilement. Dès qu'un formulaire dépassait la
 * fenêtre, il débordait des DEUX côtés — le titre disparaissait en haut, le
 * bouton de validation en bas, et aucun des deux n'était atteignable.
 *
 * ⚠️ La modale est montée dans un PORTAIL vers `document.body`, et ce n'est pas
 * une commodité. Le `<main>` de l'application porte une animation d'entrée qui
 * laisse un `transform` : un ancêtre transformé devient le bloc conteneur des
 * descendants `position: fixed`. Rendue sur place, la modale se positionnait
 * donc par rapport au `<main>` — décalée de la hauteur de l'en-tête et
 * débordant d'autant sous l'écran. Le portail la sort de cette chaîne.
 */
export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Actions de la modale. Rendues dans un pied toujours visible. */
  footer?: React.ReactNode;
}) {
  const titreId = useId();
  // `document` n'existe pas au rendu serveur : le portail n'est monté qu'après.
  const [monte, setMonte] = useState(false);
  useEffect(() => setMonte(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    // Verrou de défilement : sans lui, le doigt qui atteint le bas du corps
    // continue sur la page derrière, et on perd la modale de vue sur mobile.
    const precedent = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = precedent;
    };
  }, [open, onClose]);

  if (!open || !monte) return null;

  return createPortal(
    // z-[60] : la bulle du chat est en z-50 et passait devant la modale.
    <div
      className="fixed inset-0 z-modal overflow-y-auto overscroll-contain bg-ink/30 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        className="flex min-h-full items-start justify-center p-4 sm:items-center"
        style={{
          paddingTop: "max(1rem, env(safe-area-inset-top))",
          paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titreId}
          onMouseDown={(e) => e.stopPropagation()}
          // `dvh` suit la barre d'adresse rétractable des navigateurs mobiles ;
          // `vh` ne la connaît pas et laisse le pied sous l'écran. Repli en
          // `vh` pour Safari antérieur à 15.4, qui ignore `dvh`.
          className="flex max-h-[calc(100vh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-over supports-[height:100dvh]:max-h-[calc(100dvh-2rem)]"
        >
          <header className="flex flex-none items-center justify-between gap-3 border-b border-line px-6 py-4">
            <h2 id={titreId} className="text-lg font-semibold text-ink">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
              aria-label="Fermer"
            >
              ✕
            </button>
          </header>

          {/* `min-h-0` est indispensable : sans lui, un enfant flex refuse de
              rétrécir sous sa taille de contenu et le défilement ne prend pas. */}
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {children}
          </div>

          {footer ? (
            <footer className="flex-none border-t border-line bg-surface px-6 py-4">
              {footer}
            </footer>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
