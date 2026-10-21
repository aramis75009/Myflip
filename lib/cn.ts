import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Class name helper of the UI primitives: clsx (conditions) + tailwind-merge
 * (the last conflicting class wins).
 *
 * tailwind-merge only knows Tailwind's DEFAULT scales. tailwind.config.ts
 * replaces them with named ones, so they are declared here; otherwise
 * `text-md` would be read as a text colour and `z-modal`, `shadow-pop`,
 * `duration-slow` would never replace their counterpart (lib/cn.test.ts).
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["xs", "sm", "base", "md", "lg", "xl", "2xl", "3xl"] }],
      z: [
        {
          z: ["auto", "base", "raised", "sticky", "dock", "fab", "overlay", "modal", "popover", "toast", "tooltip", "skip"],
        },
      ],
      shadow: [{ shadow: ["none", "pop", "over"] }],
      rounded: [{ rounded: ["none", "xs", "sm", "md", "lg", "full"] }],
      duration: [{ duration: ["0", "fast", "base", "slow"] }],
      animate: [{ animate: ["none", "entree", "fondu", "pop", "shimmer", "spin"] }],
      h: [{ h: ["hit"] }],
      "min-h": [{ "min-h": ["hit"] }],
      "min-w": [{ "min-w": ["hit"] }],
    },
  },
});

export function cn(...entrees: ClassValue[]): string {
  return twMerge(clsx(entrees));
}
