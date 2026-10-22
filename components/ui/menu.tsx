"use client";

import { DropdownMenu } from "radix-ui";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";

import { cn } from "@/lib/cn";

/** Action menu (Radix DropdownMenu: arrow keys, typeahead, Escape, focus return). */
export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;

export const MenuContent = forwardRef<
  ElementRef<typeof DropdownMenu.Content>,
  ComponentPropsWithoutRef<typeof DropdownMenu.Content>
>(function MenuContent({ className, sideOffset = 6, align = "end", collisionPadding = 8, ...props }, ref) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        ref={ref}
        sideOffset={sideOffset}
        align={align}
        collisionPadding={collisionPadding}
        className={cn(
          "z-popover min-w-48 overflow-hidden rounded-md border border-line bg-surface p-1 text-ink shadow-pop motion-safe:animate-fondu",
          className,
        )}
        {...props}
      />
    </DropdownMenu.Portal>
  );
});

export const MenuItem = forwardRef<
  ElementRef<typeof DropdownMenu.Item>,
  ComponentPropsWithoutRef<typeof DropdownMenu.Item> & { tone?: "danger" }
>(function MenuItem({ className, tone, ...props }, ref) {
  return (
    <DropdownMenu.Item
      ref={ref}
      className={cn(
        "flex h-11 cursor-pointer select-none items-center gap-2 rounded-sm px-2.5 text-base md:h-9",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus data-[highlighted]:bg-surface-2",
        "data-[disabled]:pointer-events-none data-[disabled]:text-ink-3",
        tone === "danger" ? "text-neg" : "text-ink",
        className,
      )}
      {...props}
    />
  );
});

export const MenuSeparator = forwardRef<
  ElementRef<typeof DropdownMenu.Separator>,
  ComponentPropsWithoutRef<typeof DropdownMenu.Separator>
>(function MenuSeparator({ className, ...props }, ref) {
  return <DropdownMenu.Separator ref={ref} className={cn("-mx-1 my-1 h-px bg-line", className)} {...props} />;
});

export const MenuLabel = forwardRef<
  ElementRef<typeof DropdownMenu.Label>,
  ComponentPropsWithoutRef<typeof DropdownMenu.Label>
>(function MenuLabel({ className, ...props }, ref) {
  return (
    <DropdownMenu.Label
      ref={ref}
      className={cn("px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3", className)}
      {...props}
    />
  );
});
