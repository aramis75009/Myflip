"use client";

import { Ellipsis, MoveRight, Replace, Trash2 } from "lucide-react";

import { IconButton } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuSub, MenuSubContent, MenuSubTrigger, MenuTrigger } from "@/components/ui/menu";
import { MAX_PRISES, nomPrise } from "@/lib/studioCases";

const num = (o: number) => String(o).padStart(2, "0");

/**
 * The menu of a photo on the board: « Déplacer vers… » (the keyboard
 * alternative to dragging), « Remplacer la photo… », « Retirer de la planche ».
 * A photo that already gave a variant can be neither replaced nor removed:
 * the menu says so before the API would refuse it.
 */
export default function MenuPhoto({
  ordre,
  generation,
  occupees,
  servie,
  desactive,
  onDeplacer,
  onRemplacer,
  onRetirer,
}: {
  ordre: number;
  generation: string | null;
  /** Occupied cells (« échange » vs « libre » in the submenu). */
  occupees: ReadonlyMap<number, unknown>;
  servie: boolean;
  desactive: boolean;
  onDeplacer: (ordre: number) => void;
  onRemplacer: () => void;
  onRetirer: () => void;
}) {
  const nom = (o: number) => nomPrise(o, generation);
  return (
    <Menu modal={false}>
      <MenuTrigger asChild>
        <IconButton label={`Actions pour la photo ${nom(ordre)}`} size="sm" className="-mr-1 -mt-1 h-8 w-8 md:h-8 md:w-8" disabled={desactive}>
          <Ellipsis size={16} aria-hidden />
        </IconButton>
      </MenuTrigger>
      <MenuContent align="end" className="min-w-60">
        <MenuLabel className="normal-case tracking-normal">
          {num(ordre)} · {nom(ordre)}
        </MenuLabel>
        <MenuSub>
          <MenuSubTrigger>
            <MoveRight size={15} aria-hidden /> Déplacer vers…
          </MenuSubTrigger>
          <MenuSubContent>
            {Array.from({ length: MAX_PRISES }, (_, k) => k + 1)
              .filter((o) => o !== ordre)
              .map((o) => (
                <MenuItem key={o} onSelect={() => onDeplacer(o)}>
                  <span className="font-mono text-xs text-ink-2">{num(o)}</span>
                  <span className="min-w-0 flex-1 truncate">{nom(o)}</span>
                  <span className="text-xs text-ink-3">{occupees.has(o) ? "échange" : "libre"}</span>
                </MenuItem>
              ))}
          </MenuSubContent>
        </MenuSub>
        <MenuItem disabled={servie} onSelect={onRemplacer}>
          <Replace size={15} aria-hidden /> Remplacer la photo…
        </MenuItem>
        <MenuSeparator />
        <MenuItem tone="danger" disabled={servie} onSelect={onRetirer}>
          <Trash2 size={15} aria-hidden /> Retirer de la planche
        </MenuItem>
        {servie && (
          <p className="max-w-60 px-2.5 pb-1.5 pt-1 text-xs text-ink-2">
            Elle a déjà servi à une variante : ni retrait ni remplacement.
          </p>
        )}
      </MenuContent>
    </Menu>
  );
}
