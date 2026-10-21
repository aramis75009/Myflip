"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/cn";

import { Spinner } from "./spinner";

export const buttonVariants = cva(
  [
    "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded font-semibold transition-colors duration-fast max-md:min-h-hit",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
    "disabled:cursor-not-allowed disabled:border-transparent disabled:bg-surface-3 disabled:text-ink-3 aria-busy:cursor-progress",
  ],
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-ink hover:bg-accent-hover",
        secondary: "border border-line-strong bg-surface text-ink hover:bg-surface-2",
        ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
        danger: "bg-danger text-danger-ink",
        bar: "bg-bar-ink text-bar",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-9 px-4 text-base",
        lg: "h-11 px-5 text-base",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Renders the single child (a Link…) with the button styles. */
  asChild?: boolean;
  /**
   * Request in flight: aria-busy + aria-disabled (NOT `disabled`, the button
   * keeps its focus), clicks ignored, spinner + `pendingLabel`. The width
   * does not move: both labels are stacked in a grid, one invisible.
   */
  pending?: boolean;
  pendingLabel?: string;
}

/**
 * Button. `type="button"` by default (a button in a form never submits by
 * accident); pass `type="submit"` explicitly.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, asChild = false, pending = false, pendingLabel, className, type, onClick, children, ...props },
  ref,
) {
  const classes = cn(buttonVariants({ variant, size }), className);

  if (asChild) {
    return (
      <Slot.Root ref={ref} className={classes} {...props}>
        {children}
      </Slot.Root>
    );
  }

  const contenu: ReactNode =
    pending || pendingLabel ? (
      <span className="grid">
        <span className={cn("col-start-1 row-start-1 inline-flex items-center justify-center gap-2", pending && "invisible")}>
          {children}
        </span>
        <span className={cn("col-start-1 row-start-1 inline-flex items-center justify-center gap-2", !pending && "invisible")}>
          <Spinner />
          {pendingLabel ?? children}
        </span>
      </span>
    ) : (
      children
    );

  return (
    <button
      ref={ref}
      {...props}
      type={type ?? "button"}
      className={classes}
      aria-busy={pending || undefined}
      aria-disabled={pending || props["aria-disabled"] || undefined}
      onClick={(e) => {
        if (pending) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
    >
      {contenu}
    </button>
  );
});

export interface IconButtonProps extends Omit<ButtonProps, "children" | "aria-label" | "pendingLabel"> {
  /** Accessible name, mandatory: an icon alone says nothing. */
  label: string;
  /** The icon (decorative, aria-hidden). */
  children: ReactNode;
}

/** Square icon button, 44 × 44 under md, 36 × 36 above. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = "ghost", className, children, ...props },
  ref,
) {
  return (
    <Button
      ref={ref}
      variant={variant}
      aria-label={label}
      className={cn("h-11 w-11 shrink-0 px-0 md:h-9 md:w-9", className)}
      {...props}
    >
      {children}
    </Button>
  );
});
