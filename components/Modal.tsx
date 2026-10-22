"use client";

import type { ReactNode } from "react";

import { Dialog } from "@/components/ui/dialog";

/**
 * @deprecated Use `Dialog` from `components/ui/dialog` directly.
 *
 * Thin facade kept with its original signature so that its callers gain the
 * Dialog mechanics (focus trap, veil, Escape, focus return, mobile sheet)
 * without being touched. No behaviour of its own.
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
  children: ReactNode;
  /** Actions of the window, in a footer that always stays visible. */
  footer?: ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(ouvert) => {
        if (!ouvert) onClose();
      }}
      title={title}
      size="sm"
      // Callers lay their footer out themselves: give it the full width.
      footer={footer ? <div className="w-full">{footer}</div> : undefined}
    >
      {children}
    </Dialog>
  );
}
