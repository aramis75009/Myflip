"use client";

import { forwardRef, type TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

import { joindreIds, useChampField } from "./field";
import { classesChamp } from "./input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, id, "aria-describedby": decritPar, "aria-invalid": invalide, ...props }, ref) {
    const champ = useChampField();
    return (
      <textarea
        ref={ref}
        id={id ?? champ?.id}
        aria-describedby={joindreIds(champ?.describedBy, decritPar)}
        aria-invalid={invalide ?? (champ?.invalid || undefined)}
        className={cn(classesChamp, "min-h-24 py-2", className)}
        {...props}
      />
    );
  },
);
