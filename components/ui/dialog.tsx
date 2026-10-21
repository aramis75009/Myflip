"use client";

import { X } from "lucide-react";
import { Dialog as D } from "radix-ui";
import { useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";

import { cn } from "@/lib/cn";

import { AlertDialog } from "./alert-dialog";
import { IconButton } from "./button";

const FOCUSABLE =
  'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/** A click on a toast (e.g. « Annuler ») must neither be blocked nor close the window. */
function dansUnToast(cible: EventTarget | null): boolean {
  return cible instanceof Element && cible.closest("[data-sonner-toaster]") !== null;
}

export type FenetreProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** Actions, in a footer that always stays visible. */
  footer?: ReactNode;
  /** `form`: a <form> wraps the body and the footer (submit on Enter). */
  as?: "div" | "form";
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  /** Request in flight: Escape, outside click and the close button do nothing. */
  pending?: boolean;
  /** Unsaved input: outside click does nothing, Escape / close ask first. */
  dirty?: boolean;
  veil?: "normal" | "fort";
  /** Element focused on open (default: first field of the body). */
  initialFocus?: RefObject<HTMLElement | null>;
  className?: string;
};

type Placement = "centre" | "bas" | "droite";

const LARGEURS = { sm: "md:max-w-md", md: "md:max-w-lg", lg: "md:max-w-2xl" } as const;

/**
 * Shared mechanics of Dialog and Sheet (Radix Dialog).
 *
 * e2e contract (plan § 3.2): the full-screen veil (Overlay, `fixed`) CONTAINS
 * the content (`relative`), so the first `position: fixed` ancestor of
 * [role=dialog] is the veil itself.
 */
export function FenetreModale({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  as = "div",
  onSubmit,
  pending = false,
  dirty = false,
  veil = "normal",
  initialFocus,
  className,
  placement,
  largeur,
}: FenetreProps & { placement: Placement; largeur?: string }) {
  const corpsRef = useRef<HTMLDivElement>(null);
  const [confirmer, setConfirmer] = useState(false);

  function changer(suivant: boolean) {
    if (!suivant) {
      if (pending) return;
      if (dirty) {
        setConfirmer(true);
        return;
      }
    }
    onOpenChange(suivant);
  }

  function exterieur(e: { target: EventTarget | null; preventDefault: () => void }) {
    if (dansUnToast(e.target) || pending || dirty) e.preventDefault();
  }

  const corps = (
    <>
      <div ref={corpsRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
        {children}
      </div>
      {footer ? (
        <div className="flex flex-none flex-col-reverse gap-2 border-t border-line px-6 py-4 max-md:[&>button]:w-full md:flex-row md:items-center md:justify-end">
          {footer}
        </div>
      ) : null}
    </>
  );

  return (
    <D.Root open={open} onOpenChange={changer}>
      <D.Portal>
        <D.Overlay
          className={cn(
            "fixed inset-0 z-modal flex justify-center overflow-y-auto overscroll-contain motion-safe:animate-fondu",
            veil === "fort" ? "bg-veil-fort" : "bg-veil",
            // Mobile: a card anchored at the bottom, with a gutter (the veil stays
            // visible around it, and above the home indicator).
            placement === "centre" &&
              "items-end p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:items-center md:p-4",
            placement === "bas" && "items-end p-0",
            placement === "droite" && "items-end p-0 md:items-stretch md:justify-end",
          )}
        >
          <D.Content
            // Without a description, an explicit undefined tells Radix it is on purpose.
            {...(description ? {} : { "aria-describedby": undefined })}
            onOpenAutoFocus={(e) => {
              const cible =
                initialFocus?.current ?? corpsRef.current?.querySelector<HTMLElement>(FOCUSABLE) ?? null;
              if (cible) {
                e.preventDefault();
                cible.focus();
              }
            }}
            onPointerDownOutside={exterieur}
            onInteractOutside={exterieur}
            className={cn(
              "relative flex w-full flex-col bg-surface text-ink shadow-over focus-visible:outline-none motion-safe:animate-pop",
              placement === "centre" && cn("max-h-[calc(100dvh_-_0.5rem_-_max(0.5rem,env(safe-area-inset-bottom)))] rounded-lg md:max-h-[calc(100dvh-2rem)]", largeur),
              placement !== "centre" && "max-h-[calc(100dvh-2rem)] rounded-t-lg pb-[env(safe-area-inset-bottom)]",
              placement === "bas" && "md:mx-auto md:max-w-2xl",
              placement === "droite" &&
                "md:h-[100dvh] md:max-h-none md:w-[440px] md:max-w-[calc(100vw-2rem)] md:rounded-none md:border-l md:border-line md:pb-0",
              className,
            )}
          >
            <div className="flex flex-none items-start justify-between gap-3 border-b border-line py-3 pl-6 pr-3">
              <div className="min-w-0 pt-1.5">
                <D.Title className="text-lg font-semibold text-ink">{title}</D.Title>
                {description ? (
                  <D.Description className="mt-1 text-sm text-ink-2">{description}</D.Description>
                ) : null}
              </div>
              <D.Close asChild>
                <IconButton label="Fermer" aria-disabled={pending || undefined}>
                  <X aria-hidden className="h-5 w-5" />
                </IconButton>
              </D.Close>
            </div>
            {as === "form" ? (
              <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
                {corps}
              </form>
            ) : (
              corps
            )}
          </D.Content>
        </D.Overlay>
      </D.Portal>
      <AlertDialog
        open={confirmer}
        onOpenChange={setConfirmer}
        title="Abandonner la saisie en cours ?"
        description="Ce que tu as saisi dans cette fenêtre sera perdu."
        confirmLabel="Abandonner"
        cancelLabel="Continuer la saisie"
        tone="danger"
        onConfirm={() => {
          setConfirmer(false);
          onOpenChange(false);
        }}
      />
    </D.Root>
  );
}

export type DialogProps = FenetreProps & { size?: "sm" | "md" | "lg" };

/**
 * The application's modal window: centred on desktop, a card anchored at
 * the bottom on mobile (8 px gutter, height capped by 100dvh, scrolling
 * body, footer always visible above the keyboard and the home indicator).
 */
export function Dialog({ size = "md", ...props }: DialogProps) {
  return <FenetreModale {...props} placement="centre" largeur={LARGEURS[size]} />;
}
