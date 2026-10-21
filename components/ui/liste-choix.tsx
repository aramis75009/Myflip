"use client";

import { Check, ChevronDown } from "lucide-react";
import { Popover as P } from "radix-ui";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "@/lib/cn";

export type OptionListe<T extends string = string> = { valeur: T; libelle: string };

/**
 * Single choice in a list that opens (APG listbox pattern): a
 * <button aria-haspopup="listbox"> opens a <ul role="listbox"> of
 * <li role="option" aria-selected>. On open the active option is focused;
 * ↑ ↓ Home End move, Enter / Space choose and close, Escape closes and
 * gives the focus back to the button.
 */
export function ListeChoix<T extends string>({
  libelleId,
  valeur,
  options,
  onChange,
  children,
  className,
}: {
  /** id of the visible label of the list. */
  libelleId: string;
  valeur: T;
  options: OptionListe<T>[];
  onChange: (valeur: T) => void;
  /** Content of the trigger (current value, icon…). */
  children: ReactNode;
  className?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const listeRef = useRef<HTMLUListElement>(null);

  const optionsDom = () => Array.from(listeRef.current?.querySelectorAll<HTMLLIElement>('[role="option"]') ?? []);

  function choisir(v: T) {
    onChange(v);
    setOuvert(false);
  }

  function clavier(e: KeyboardEvent<HTMLUListElement>) {
    const items = optionsDom();
    const i = items.indexOf(document.activeElement as HTMLLIElement);
    const aller = (n: number) => {
      e.preventDefault();
      items[Math.max(0, Math.min(items.length - 1, n))]?.focus();
    };
    if (e.key === "ArrowDown") aller(i + 1);
    else if (e.key === "ArrowUp") aller(i - 1);
    else if (e.key === "Home") aller(0);
    else if (e.key === "End") aller(items.length - 1);
    else if ((e.key === "Enter" || e.key === " ") && i >= 0) {
      e.preventDefault();
      choisir(options[i].valeur);
    }
  }

  return (
    <P.Root open={ouvert} onOpenChange={setOuvert}>
      <P.Trigger
        aria-haspopup="listbox"
        className={cn(
          "inline-flex min-h-hit items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus md:min-h-0",
          className,
        )}
      >
        {children}
        <ChevronDown aria-hidden className="h-4 w-4 shrink-0 text-ink-3" />
      </P.Trigger>
      <P.Portal>
        <P.Content
          // A listbox, not a dialog: Radix's role="dialog" is removed.
          role={undefined}
          align="start"
          sideOffset={6}
          collisionPadding={16}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            const items = optionsDom();
            const actif = items[options.findIndex((o) => o.valeur === valeur)] ?? items[0];
            actif?.focus();
          }}
          className="z-popover w-[min(20rem,calc(100vw-2rem))] rounded-md border border-line bg-surface p-1 text-ink shadow-pop focus-visible:outline-none motion-safe:animate-fondu"
        >
          <ul
            ref={listeRef}
            role="listbox"
            aria-labelledby={libelleId}
            onKeyDown={clavier}
            className="max-h-[min(22rem,60dvh)] overflow-y-auto overscroll-contain"
          >
            {options.map((o) => {
              const choisi = o.valeur === valeur;
              return (
                <li
                  key={o.valeur}
                  role="option"
                  aria-selected={choisi}
                  tabIndex={-1}
                  onClick={() => choisir(o.valeur)}
                  className={cn(
                    "flex min-h-hit cursor-pointer items-center justify-between gap-3 rounded-sm px-2.5 text-base md:min-h-9",
                    "hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus",
                    choisi ? "font-semibold text-ink" : "text-ink-2",
                  )}
                >
                  <span className="min-w-0 truncate">{o.libelle}</span>
                  {choisi ? <Check aria-hidden className="h-4 w-4 shrink-0 text-accent-text" /> : null}
                </li>
              );
            })}
          </ul>
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}
