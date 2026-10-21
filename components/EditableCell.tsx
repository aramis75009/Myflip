"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Table cell editable in place.
 *
 * At rest the value is a real button (reachable with Tab, named « Modifier
 * <champ> de <sku> : <valeur> »): Enter or F2 opens the editor, as does a
 * double click. While editing: Enter saves, Escape cancels (focus back on the
 * cell), Tab saves and lets the focus move on.
 */
export default function EditableCell({
  value,
  display,
  type = "text",
  align = "left",
  editable = true,
  placeholder = "—",
  options,
  champ,
  sku,
  onSave,
}: {
  value: string | number | null;
  display?: string;
  /** « select »: closed list, requires `options`. The empty value = « — ». */
  type?: "text" | "number" | "date" | "select";
  align?: "left" | "right" | "center";
  editable?: boolean;
  placeholder?: string;
  options?: ReadonlyArray<{ value: string; label: string }>;
  /** Field name, for the accessible name (« prix achat »). */
  champ?: string;
  /** SKU of the row, for the accessible name. */
  sku?: string;
  onSave: (raw: string) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const boutonRef = useRef<HTMLButtonElement>(null);
  // Editing closed from the keyboard (Enter, Escape): focus returns to the cell.
  const rendreFocus = useRef(false);

  useEffect(() => {
    if (!editing) {
      if (rendreFocus.current) {
        rendreFocus.current = false;
        boutonRef.current?.focus();
      }
      return;
    }
    if (type === "select") {
      selectRef.current?.focus();
      return;
    }
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing, type]);

  const start = () => {
    if (!editable) return;
    setDraft(value == null ? "" : String(value));
    setEditing(true);
  };

  const commit = async (next: string = draft) => {
    setEditing(false);
    const original = value == null ? "" : String(value);
    if (next !== original) {
      await onSave(next);
    }
  };

  const cancel = () => setEditing(false);

  const alignCls =
    align === "right"
      ? "text-right"
      : align === "center"
        ? "text-center"
        : "text-left";

  if (editing && type === "select") {
    // A list commits on choice: no Enter needed. Escape and blur close it
    // without changing anything.
    return (
      <select
        ref={selectRef}
        value={draft}
        onChange={(e) => void commit(e.target.value)}
        onBlur={cancel}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            rendreFocus.current = true;
            cancel();
          }
        }}
        className={cn(
          "w-full cursor-pointer rounded border border-accent bg-surface px-2 py-1 text-ink focus-visible:outline-none ring-2 ring-focus",
          alignCls,
        )}
      >
        <option value="">{placeholder}</option>
        {(options ?? []).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type={type === "select" ? "text" : type}
        step={type === "number" ? "any" : undefined}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            rendreFocus.current = true;
            void commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            rendreFocus.current = true;
            cancel();
          }
        }}
        className={cn(
          "w-full rounded border border-accent bg-surface px-2 py-1 text-ink focus-visible:outline-none ring-2 ring-focus",
          alignCls,
        )}
      />
    );
  }

  const shown = display ?? (value == null || value === "" ? placeholder : String(value));
  const isPlaceholder = display
    ? false
    : value == null || value === "";

  if (!editable) {
    return (
      <div className={cn("cursor-default truncate rounded px-2 py-1", alignCls, isPlaceholder && "text-ink-3")}>
        {shown}
      </div>
    );
  }

  return (
    <button
      ref={boutonRef}
      type="button"
      aria-label={champ && sku ? "Modifier " + champ + " de " + sku + " : " + shown : "Modifier la valeur"}
      onDoubleClick={start}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "F2") {
          e.preventDefault();
          start();
        }
      }}
      title="Double-clic pour modifier"
      className={cn(
        "block w-full cursor-cell truncate rounded px-2 py-1 hover:bg-surface-2",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
        alignCls,
        isPlaceholder && "text-ink-3",
      )}
    >
      {shown}
    </button>
  );
}
