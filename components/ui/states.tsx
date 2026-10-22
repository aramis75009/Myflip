"use client";

import { CircleAlert, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

import { Button } from "./button";

/** Nothing to show yet: what it is, and what to do next. */
export function EmptyState({
  icone,
  titre,
  description,
  action,
  className,
}: {
  icone?: ReactNode;
  titre: ReactNode;
  description: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-2 px-4 py-10 text-center", className)}>
      {icone ? <div className="mb-1 text-ink-3 [&>svg]:h-8 [&>svg]:w-8">{icone}</div> : null}
      <p className="text-base font-semibold text-ink">{titre}</p>
      <p className="max-w-sm text-sm text-ink-2">{description}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

/** Loading or saving failed: says what happened and offers « Réessayer ». */
export function ErrorState({
  titre,
  description,
  detail,
  onRetry,
  className,
}: {
  titre: ReactNode;
  description?: ReactNode;
  detail?: ReactNode;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div role="alert" className={cn("flex flex-col items-center gap-2 px-4 py-10 text-center", className)}>
      <CircleAlert aria-hidden className="mb-1 h-8 w-8 text-neg" />
      <p className="text-base font-semibold text-ink">{titre}</p>
      {description ? <p className="max-w-sm text-sm text-ink-2">{description}</p> : null}
      {detail ? <p className="max-w-sm break-words font-mono text-xs text-ink-3">{detail}</p> : null}
      {onRetry ? (
        <Button variant="secondary" className="mt-3" onClick={onRetry}>
          <RotateCcw aria-hidden className="h-4 w-4" />
          Réessayer
        </Button>
      ) : null}
    </div>
  );
}

/** Decorative placeholder block. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("rounded bg-surface-3 motion-safe:animate-shimmer", className)} />;
}

/** Whole-page placeholder while a route loads. */
export function SquelettePage() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4 p-4 md:p-6">
      <span className="sr-only">Chargement…</span>
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
