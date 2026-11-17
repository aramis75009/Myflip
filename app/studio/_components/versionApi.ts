// Appels et petits outils de l'écran Versions (côté navigateur).

import type { VersionEnBase } from "@/lib/studioVersion";

import { lireErreur } from "./envoi";

/**
 * Une file : les enregistrements d'une version partent UN à la fois, dans
 * l'ordre. Chaque réponse porte la version ENTIÈRE ; deux requêtes en vol
 * pourraient rendre l'ancienne après la récente et faire reculer un champ.
 */
export type Enfiler = <T>(tache: () => Promise<T>) => Promise<T>;

export type ResultatEnregistrement = { ok: true; version: VersionEnBase } | { ok: false; message: string };

/** `PATCH /api/studio/versions/[id]` : n'écrit que les champs du corps. */
export async function patchVersion(id: string, corps: object): Promise<ResultatEnregistrement> {
  try {
    const res = await fetch(`/api/studio/versions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corps),
    });
    if (!res.ok) return { ok: false, message: await lireErreur(res) };
    return { ok: true, version: ((await res.json()) as { version: VersionEnBase }).version };
  } catch {
    return { ok: false, message: "connexion perdue." };
  }
}

/** Clipboard, with the old fallback when the API is refused (non-secure context, permission). */
export async function copier(texte: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texte);
    return true;
  } catch {
    const zone = document.createElement("textarea");
    zone.value = texte;
    zone.setAttribute("readonly", "");
    zone.style.position = "fixed";
    zone.style.opacity = "0";
    document.body.appendChild(zone);
    zone.select();
    const ok = document.execCommand("copy");
    zone.remove();
    return ok;
  }
}
