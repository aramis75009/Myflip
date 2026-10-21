import { describe, expect, it } from "vitest";

import { cn } from "./cn";

// tailwind-merge only knows Tailwind's default scales: without the
// extension in lib/cn.ts, `text-md` would be read as a text COLOUR (and
// would drop `text-ink`), and `z-modal`, `shadow-pop`, `duration-slow`
// would never replace their counterpart.
describe("cn", () => {
  it("merges the named text sizes", () => {
    expect(cn("text-sm text-ink", "text-md")).toBe("text-ink text-md");
  });

  it("keeps a text colour next to a text size", () => {
    expect(cn("text-ink-3", "text-xs")).toBe("text-ink-3 text-xs");
  });

  it("merges the named z-index scale", () => {
    expect(cn("z-sticky", "z-modal")).toBe("z-modal");
  });

  it("merges the named shadows", () => {
    expect(cn("shadow-none", "shadow-pop")).toBe("shadow-pop");
  });

  it("merges radii", () => {
    expect(cn("rounded-sm", "rounded-lg")).toBe("rounded-lg");
  });

  it("merges named durations", () => {
    expect(cn("duration-fast", "duration-slow")).toBe("duration-slow");
  });

  it("merges token colours", () => {
    expect(cn("bg-surface", "bg-surface-2")).toBe("bg-surface-2");
  });

  it("merges named animations and the hit height", () => {
    expect(cn("motion-safe:animate-entree", "motion-safe:animate-pop")).toBe("motion-safe:animate-pop");
    expect(cn("h-9", "h-hit")).toBe("h-hit");
  });

  it("accepts conditional values (clsx)", () => {
    expect(cn("a", false && "b", null, undefined, { c: true, d: false })).toBe("a c");
  });
});
