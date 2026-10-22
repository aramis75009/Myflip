"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { lienApp } from "@/lib/hosts";

const LIENS = [
  { href: "#probleme", label: "Le problème" },
  { href: "#fonctionnalites", label: "Fonctionnalités" },
  { href: "#methode", label: "Méthode" },
  { href: "#tarifs", label: "Tarifs" },
  { href: "#faq", label: "FAQ" },
];

export default function LandingNav() {
  const [ouvert, setOuvert] = useState(false);

  return (
    <header className="sticky top-0 z-sticky border-b border-line bg-bg/85 backdrop-blur-md">
      <nav
        aria-label="Navigation principale"
        className="mx-auto flex h-[72px] max-w-[1200px] items-center justify-between px-5 sm:px-6"
      >
        {/* h-11 : cible tactile de 44px, règle mobile de CLAUDE.md. */}
        <Link
          href="/"
          className="flex h-11 items-center gap-2.5"
          aria-label="MyFlip, accueil"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded bg-accent font-sans text-md font-bold text-accent-ink">
            M
          </span>
          <span className="font-sans text-lg font-bold tracking-[-0.02em] text-ink">
            MyFlip
          </span>
        </Link>

        <ul className="hidden items-center gap-8 lg:flex">
          {LIENS.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                className="text-base font-medium text-ink-2 transition-colors hover:text-ink"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-3 lg:flex">
          <Link
            href={lienApp("/login")}
            className="px-3 py-2 text-base font-semibold text-ink-2 transition-colors hover:text-ink"
          >
            Connexion
          </Link>
          <Link
            href={lienApp("/signup")}
            className="rounded-full bg-accent px-5 py-2.5 text-base font-bold text-accent-ink transition-colors hover:bg-accent-hover"
          >
            Créer mon compte
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOuvert((v) => !v)}
          aria-expanded={ouvert}
          aria-controls="menu-mobile"
          aria-label={ouvert ? "Fermer le menu" : "Ouvrir le menu"}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-ink transition-colors hover:bg-surface-2 lg:hidden"
        >
          {ouvert ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {ouvert && (
        <div
          id="menu-mobile"
          className="border-t border-line bg-surface px-5 py-6 lg:hidden"
        >
          <ul className="flex flex-col gap-1">
            {LIENS.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  onClick={() => setOuvert(false)}
                  className="flex min-h-11 items-center font-sans text-md font-semibold text-ink"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-col gap-2.5 border-t border-line pt-5">
            <Link
              href={lienApp("/login")}
              onClick={() => setOuvert(false)}
              className="flex min-h-11 items-center justify-center rounded-lg border border-line text-base font-semibold text-ink"
            >
              Connexion
            </Link>
            <Link
              href={lienApp("/signup")}
              onClick={() => setOuvert(false)}
              className="flex min-h-11 items-center justify-center rounded-lg bg-accent text-base font-bold text-accent-ink"
            >
              Créer mon compte
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
