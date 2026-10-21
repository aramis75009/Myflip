import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { CSSProperties, HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

/** Data table (desktop; under md, screens show cards instead). */
export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return <table className={cn("w-full border-collapse text-sm text-ink", className)} {...props} />;
}

export function THead({ collant = false, className, ...props }: HTMLAttributes<HTMLTableSectionElement> & { collant?: boolean }) {
  return <thead className={cn("bg-surface-2", collant && "sticky top-0 z-raised", className)} {...props} />;
}

export function TBody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}

const ARIA_SORT = { asc: "ascending", desc: "descending", none: "none" } as const;

/**
 * Column header. With `onTri`, the header holds a button and announces its
 * sort state (`aria-sort`).
 */
export function TH({
  tri,
  onTri,
  className,
  children,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement> & { tri?: "asc" | "desc" | "none"; onTri?: () => void }) {
  const Icone = tri === "asc" ? ArrowUp : tri === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <th
      scope="col"
      aria-sort={tri ? ARIA_SORT[tri] : undefined}
      className={cn(
        "h-9 border-b border-line px-3 text-left align-middle text-xs font-semibold uppercase tracking-wide text-ink-2",
        className,
      )}
      {...props}
    >
      {onTri ? (
        <button
          type="button"
          onClick={onTri}
          className="-mx-1 inline-flex items-center gap-1 rounded-xs px-1 uppercase hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          {children}
          <Icone aria-hidden className={cn("h-3.5 w-3.5", tri === "none" || !tri ? "text-ink-3" : "text-ink")} />
        </button>
      ) : (
        children
      )}
    </th>
  );
}

export function TR({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-b border-line last:border-0", className)} {...props} />;
}

export function TD({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-3 py-2 align-middle", className)} {...props} />;
}

// Scroll hint in pure CSS: two "local" covers travel with the content and
// hide two "scroll" shadows pinned to the edges, so a shadow shows only on
// the side where content remains.
const OMBRES_DEFILEMENT: CSSProperties = {
  backgroundImage: [
    "linear-gradient(to right, rgb(var(--surface)), rgb(var(--surface)))",
    "linear-gradient(to right, rgb(var(--surface)), rgb(var(--surface)))",
    "linear-gradient(to right, rgb(var(--shadow) / calc(0.12 * var(--sh-k))), transparent)",
    "linear-gradient(to left, rgb(var(--shadow) / calc(0.12 * var(--sh-k))), transparent)",
  ].join(", "),
  backgroundPosition: "left center, right center, left center, right center",
  backgroundRepeat: "no-repeat",
  backgroundSize: "24px 100%, 24px 100%, 12px 100%, 12px 100%",
  backgroundAttachment: "local, local, scroll, scroll",
};

/** Horizontally scrolling container, with a shadow while content remains. */
export function TableDefilante({ className, style, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("overflow-x-auto overscroll-x-contain bg-surface", className)}
      style={{ ...OMBRES_DEFILEMENT, ...style }}
      {...props}
    />
  );
}

/** Actions column, stuck to the right while the table scrolls. */
export function ColonneActions({
  as = "td",
  className,
  children,
  ...props
}: (TdHTMLAttributes<HTMLTableCellElement> & ThHTMLAttributes<HTMLTableCellElement>) & {
  as?: "td" | "th";
  children?: ReactNode;
}) {
  const Balise = as;
  return (
    <Balise
      {...(as === "th" ? { scope: "col" } : {})}
      className={cn("sticky right-0 z-raised bg-surface px-3 text-right", className)}
      {...props}
    >
      {children}
    </Balise>
  );
}
