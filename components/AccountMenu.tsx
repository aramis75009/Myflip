"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { LogOut, Scale, UserCircle } from "lucide-react";

import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { useIdentite } from "@/lib/useIdentite";

import { LIENS_LEGAUX, useMenuReplie } from "./cadre/navigation";

/**
 * Avatar + account menu, in the top bar (right of the theme toggle). Radix
 * menu: arrow keys, Escape, focus back on the avatar. When the side menu is
 * collapsed to a rail, its legal links move here.
 */
export default function AccountMenu() {
  const { initiale, nom } = useIdentite();
  const replie = useMenuReplie();

  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          aria-label={nom ? `Mon compte (${nom})` : "Mon compte"}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-accent font-sans text-md font-bold text-accent-ink transition-colors duration-fast hover:bg-accent-hover md:h-10 md:w-10"
        >
          {initiale}
        </button>
      </MenuTrigger>

      <MenuContent className="w-[214px]">
        <div className="flex items-center gap-3 border-b border-line px-2.5 pb-3 pt-2">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-accent font-sans text-base font-bold text-accent-ink"
          >
            {initiale}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-base font-bold text-ink">{nom || "Mon compte"}</span>
            <span className="block text-xs font-medium text-ink-3">Connecté</span>
          </span>
        </div>
        <MenuItem asChild className="mt-1">
          <Link href="/compte">
            <UserCircle aria-hidden className="h-[18px] w-[18px] text-ink-2" strokeWidth={2} />
            Mon compte
          </Link>
        </MenuItem>
        {replie && (
          <>
            <MenuSeparator />
            {LIENS_LEGAUX.map((l) => (
              <MenuItem key={l.href} asChild>
                <Link href={l.href}>
                  <Scale aria-hidden className="h-[18px] w-[18px] text-ink-2" strokeWidth={2} />
                  {l.libelle}
                </Link>
              </MenuItem>
            ))}
          </>
        )}
        <MenuSeparator />
        <MenuItem tone="danger" onSelect={() => signOut({ callbackUrl: "/login" })}>
          <LogOut aria-hidden className="h-[18px] w-[18px]" strokeWidth={2} />
          Se déconnecter
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
