"use client";

import { Popover as P } from "radix-ui";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";

import { cn } from "@/lib/cn";

/** Popover (Radix: collisions, Escape, outside click, focus return). */
export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverAnchor = P.Anchor;
export const PopoverClose = P.Close;

export const PopoverContent = forwardRef<
  ElementRef<typeof P.Content>,
  ComponentPropsWithoutRef<typeof P.Content>
>(function PopoverContent({ className, sideOffset = 6, align = "start", collisionPadding = 16, ...props }, ref) {
  return (
    <P.Portal>
      <P.Content
        ref={ref}
        sideOffset={sideOffset}
        align={align}
        collisionPadding={collisionPadding}
        className={cn(
          "z-popover w-[min(24rem,calc(100vw-2rem))] rounded-md border border-line bg-surface p-3 text-ink shadow-pop focus-visible:outline-none motion-safe:animate-fondu",
          className,
        )}
        {...props}
      />
    </P.Portal>
  );
});
