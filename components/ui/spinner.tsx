"use client";

import { LoaderCircle } from "lucide-react";

import { cn } from "@/lib/cn";

/** Decorative spinner: always next to a text that says what is loading. */
export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle aria-hidden className={cn("h-4 w-4 shrink-0 motion-safe:animate-spin", className)} />;
}
