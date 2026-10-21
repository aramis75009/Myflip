"use client";

import Link from "next/link";
import { Tabs as T } from "radix-ui";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";

import { cn } from "@/lib/cn";

const classeOnglet = cn(
  "relative inline-flex h-11 items-center gap-2 whitespace-nowrap px-3 text-base font-medium text-ink-2 transition-colors duration-fast hover:text-ink md:h-9",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus",
  "after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-transparent",
);
// Active tab: ink text, bolder weight and an accent underline (not colour alone).
const classeActif = "font-semibold text-ink after:bg-accent";

/** Tabs (Radix: role=tab, aria-selected, arrow keys). */
export const Tabs = T.Root;

export const TabsList = forwardRef<ElementRef<typeof T.List>, ComponentPropsWithoutRef<typeof T.List>>(
  function TabsList({ className, ...props }, ref) {
    return (
      <T.List
        ref={ref}
        className={cn("flex items-center gap-1 overflow-x-auto border-b border-line", className)}
        {...props}
      />
    );
  },
);

export const TabsTrigger = forwardRef<ElementRef<typeof T.Trigger>, ComponentPropsWithoutRef<typeof T.Trigger>>(
  function TabsTrigger({ className, ...props }, ref) {
    return (
      <T.Trigger
        ref={ref}
        className={cn(
          classeOnglet,
          "data-[state=active]:font-semibold data-[state=active]:text-ink data-[state=active]:after:bg-accent",
          className,
        )}
        {...props}
      />
    );
  },
);

export const TabsContent = forwardRef<ElementRef<typeof T.Content>, ComponentPropsWithoutRef<typeof T.Content>>(
  function TabsContent({ className, ...props }, ref) {
    return <T.Content ref={ref} className={cn("pt-4", className)} {...props} />;
  },
);

/** Tabs that are links (one route per tab): <nav aria-label> + aria-current="page". */
export function TabsLiens({
  label,
  liens,
  className,
}: {
  label: string;
  liens: { href: string; libelle: string; actif: boolean }[];
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn("flex items-center gap-1 overflow-x-auto border-b border-line", className)}>
      {liens.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={l.actif ? "page" : undefined}
          className={cn(classeOnglet, l.actif && classeActif)}
        >
          {l.libelle}
        </Link>
      ))}
    </nav>
  );
}
