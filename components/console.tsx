// Page layout primitives (« Direction C — Console tactile »), shared by the
// Dashboard, the Statistics and most frame pages.
//
// Mock-up conventions kept as they are: some arbitrary spacings, and grids
// switching at `min-[900px]:`, neither `md:` (768) nor `lg:` (1024).

import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Page container: the `<main>` of the frame, target of the skip link.
 *
 * It fills the frame column (`flex-1`): no `min-h-screen` (the column has
 * the only full height), no background (the body's), and an opacity-only
 * entrance, so no `transform` is left on an ancestor of fixed overlays.
 */
export function Frame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main
      id="contenu"
      tabIndex={-1}
      className={cn("flex min-h-0 flex-1 flex-col gap-3.5 p-3.5 motion-safe:animate-fondu min-[900px]:p-[18px]", className)}
    >
      {children}
    </main>
  );
}

/**
 * Module shell: the recurring container of Direction C, the same surface as
 * `Panel` (components/ui/panel.tsx). `className` REPLACES the default padding
 * because the mock-up alternates 16 / 18 / 20 / 22 / 24 px, and a module
 * holding a horizontally scrolling table must not clip it.
 */
export function Module({
  children,
  className = "p-[18px]",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={cn("rounded-lg border border-line bg-surface", className)}>{children}</section>;
}

/** Mono micro-label: the section tag of Direction C. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="font-mono text-xs tracking-[0.2em] text-ink-3">{children}</div>;
}

/**
 * Card title, a real heading (`h2` by default, `h3` under another card
 * title), with its optional mono `aside`. The bottom margin varies from card
 * to card: it goes through `className`, which REPLACES the default.
 */
export function CardTitle({
  children,
  aside,
  as: Titre = "h2",
  className = "mb-3.5",
}: {
  children: ReactNode;
  aside?: ReactNode;
  as?: "h2" | "h3";
  className?: string;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${className}`}>
      <Titre className="text-md font-semibold tracking-[-0.01em] text-ink">{children}</Titre>
      {aside && <span className="flex-none font-mono text-xs text-ink-3">{aside}</span>}
    </div>
  );
}
