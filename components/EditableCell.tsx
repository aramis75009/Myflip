"use client";

import { useEffect, useRef, useState } from "react";

export default function EditableCell({
  value,
  display,
  type = "text",
  align = "left",
  editable = true,
  placeholder = "—",
  options,
  onSave,
}: {
  value: string | number | null;
  display?: string;
  /** « select » : liste fermée, qui exige `options`. La valeur vide = « — ». */
  type?: "text" | "number" | "date" | "select";
  align?: "left" | "right" | "center";
  editable?: boolean;
  placeholder?: string;
  options?: ReadonlyArray<{ value: string; label: string }>;
  onSave: (raw: string) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (!editing) return;
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
    // Une liste se valide au choix : pas d'Entrée à taper. Échap et la perte de
    // focus referment sans rien changer.
    return (
      <select
        ref={selectRef}
        value={draft}
        onChange={(e) => void commit(e.target.value)}
        onBlur={cancel}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        className={`w-full cursor-pointer rounded border border-primary bg-surface px-2 py-1 text-ink outline-none ring-2 ring-[var(--acc-ring)] ${alignCls}`}
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
            void commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        className={`w-full rounded border border-primary bg-surface px-2 py-1 text-ink outline-none ring-2 ring-[var(--acc-ring)] ${alignCls}`}
      />
    );
  }

  const shown = display ?? (value == null || value === "" ? placeholder : String(value));
  const isPlaceholder = display
    ? false
    : value == null || value === "";

  return (
    <div
      onDoubleClick={start}
      title={editable ? "Double-clic pour modifier" : undefined}
      className={`truncate rounded px-2 py-1 ${alignCls} ${
        editable ? "cursor-cell hover:bg-surface-container" : "cursor-default"
      } ${isPlaceholder ? "text-ink-faint" : ""}`}
    >
      {shown}
    </div>
  );
}
