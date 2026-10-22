"use client";

import { AlertDialog as AD } from "radix-ui";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

import { Button } from "./button";

/**
 * Confirmation of a destructive or irreversible action (replaces
 * window.confirm). Initial focus on « Annuler » (Radix default).
 *
 * The window never closes itself on confirm: `onConfirm` runs, and the
 * caller closes it (`onOpenChange(false)`) once done — possibly after a
 * request, shown by `pending`.
 */
export function AlertDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Annuler",
  onConfirm,
  pending = false,
  pendingLabel,
  tone = "danger",
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  pending?: boolean;
  pendingLabel?: string;
  tone?: "danger" | "neutre";
  /** Details under the description (a quote, a list): block content, which a description paragraph cannot hold. */
  children?: ReactNode;
}) {
  return (
    <AD.Root
      open={open}
      onOpenChange={(suivant) => {
        if (!suivant && pending) return;
        onOpenChange(suivant);
      }}
    >
      <AD.Portal>
        <AD.Overlay className="fixed inset-0 z-modal flex items-end justify-center overflow-y-auto overscroll-contain bg-veil p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] motion-safe:animate-fondu md:items-center md:p-4">
          <AD.Content
            className={cn(
              "relative w-full bg-surface p-6 text-ink shadow-over focus-visible:outline-none motion-safe:animate-pop",
              "max-h-[calc(100dvh_-_0.5rem_-_max(0.5rem,env(safe-area-inset-bottom)))] overflow-y-auto rounded-lg md:max-w-md",
            )}
          >
            <AD.Title className="text-lg font-semibold text-ink">{title}</AD.Title>
            <AD.Description className="mt-2 text-base text-ink-2">{description}</AD.Description>
            {children ? <div className="mt-4">{children}</div> : null}
            <div className="mt-6 flex flex-col-reverse gap-2 max-md:[&>button]:w-full md:flex-row md:justify-end">
              <AD.Cancel asChild>
                <Button variant="secondary" aria-disabled={pending || undefined}>
                  {cancelLabel}
                </Button>
              </AD.Cancel>
              <Button
                variant={tone === "danger" ? "danger" : "primary"}
                pending={pending}
                pendingLabel={pendingLabel}
                onClick={onConfirm}
              >
                {confirmLabel}
              </Button>
            </div>
          </AD.Content>
        </AD.Overlay>
      </AD.Portal>
    </AD.Root>
  );
}
