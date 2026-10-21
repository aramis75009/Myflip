"use client";

import { Tooltip as T } from "radix-ui";
import type { ReactNode } from "react";

/**
 * Tooltip: a complement, never the only carrier of information (it does
 * not exist on touch screens). The trigger must be focusable.
 */
export function Tooltip({
  contenu,
  children,
  side = "top",
}: {
  contenu: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <T.Provider delayDuration={300}>
      <T.Root>
        <T.Trigger asChild>{children}</T.Trigger>
        <T.Portal>
          <T.Content
            side={side}
            sideOffset={6}
            collisionPadding={8}
            className="z-tooltip max-w-xs rounded-xs bg-bar px-2 py-1 text-xs text-bar-ink shadow-pop motion-safe:animate-fondu"
          >
            {contenu}
          </T.Content>
        </T.Portal>
      </T.Root>
    </T.Provider>
  );
}
