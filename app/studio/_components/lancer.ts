// Appels du Studio côté navigateur : copie, génération d'une case, avis IA.
// Aucune image ne transite ici : elles vont au Blob, l'écran les relit par
// /api/studio/image.

import { toast } from "sonner";
import type { Devis } from "@/lib/studioModeles";

export async function copier(texte: string, quoi = "Prompt") {
  try {
    await navigator.clipboard.writeText(texte);
    toast.success(`${quoi} copié.`);
  } catch {
    toast.error("Copie refusée par le navigateur.");
  }
}

/** Erreurs qui se règlent dans « Mon compte » (clé OpenRouter, crédit). */
export const CODES_COMPTE = new Set(["missing_key", "bad_key", "no_credits"]);

const PEUT_ETRE_FACTUREE = "elle a peut-être été facturée, vérifie ton activité OpenRouter avant de relancer.";

export type ReponseGeneration =
  | { kind: "ok"; essaiId: string }
  | { kind: "confirmation"; devis: Devis | null; message: string | null }
  | { kind: "erreur"; code: string | null; message: string };

/** Le devis d'un 409, s'il a la bonne forme. */
function lireDevis(v: unknown): Devis | null {
  if (typeof v !== "object" || v === null) return null;
  const d = v as Partial<Devis>;
  if (!Array.isArray(d.lignes) || typeof d.totalConnuUsd !== "number" || typeof d.inconnus !== "number") return null;
  return { lignes: d.lignes, totalConnuUsd: d.totalConnuUsd, inconnus: d.inconnus, confirmationRequise: d.confirmationRequise !== false };
}

/** Une génération = une case = une requête. */
export async function envoyerGeneration(corps: Record<string, unknown>): Promise<ReponseGeneration> {
  let res: Response;
  try {
    res = await fetch("/api/studio/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corps),
    });
  } catch {
    return { kind: "erreur", code: null, message: `connexion perdue pendant la génération : ${PEUT_ETRE_FACTUREE}` };
  }
  const j = (await res.json().catch(() => null)) as { essai?: { id?: unknown }; error?: unknown; code?: unknown; devis?: unknown } | null;
  if (res.ok && j?.essai && typeof j.essai.id === "string") return { kind: "ok", essaiId: j.essai.id };
  if (res.status === 409 && j?.code === "confirmation_requise") {
    return { kind: "confirmation", devis: lireDevis(j.devis), message: typeof j.error === "string" && j.error ? j.error : null };
  }
  if (!j) {
    // Pas de JSON : une coupure de la plateforme (délai de la fonction dépassé…), pas une erreur de la route.
    const delai = res.status === 504 || res.status === 502;
    return { kind: "erreur", code: null, message: delai ? `délai dépassé (${res.status}) : ${PEUT_ETRE_FACTUREE}` : `réponse illisible (${res.status}).` };
  }
  return {
    kind: "erreur",
    code: typeof j.code === "string" ? j.code : null,
    message: typeof j.error === "string" && j.error ? j.error : `erreur ${res.status}.`,
  };
}

export type ResultatAvis = { ok: true } | { ok: false; message: string; code: string | null };

/**
 * Lance l'avis IA d'un essai. En échec, la raison est RENDUE (l'écran la garde
 * à côté de l'image : « Avis IA en échec », distinct de « pas encore d'avis »)
 * et montrée en toast, avec « Mon compte » quand c'est la clé qui manque.
 */
export async function demanderAvis(essaiId: string, versCompte: () => void): Promise<ResultatAvis> {
  const res = await fetch(`/api/studio/essais/${essaiId}/verifier`, { method: "POST" }).catch(() => null);
  if (res?.ok) return { ok: true };
  const j = (await res?.json().catch(() => null)) as { error?: string; code?: string } | null;
  const message = j?.error ?? (res ? `réponse ${res.status}` : "connexion perdue");
  const code = typeof j?.code === "string" ? j.code : null;
  toast.error(`Avis IA en échec : ${message}`, {
    duration: 10000,
    action: CODES_COMPTE.has(code ?? "") ? { label: "Mon compte", onClick: versCompte } : undefined,
  });
  return { ok: false, message, code };
}

/** Exécute `taches` au plus `n` à la fois, dans l'ordre de départ. */
export async function parPaquets<T>(taches: (() => Promise<T>)[], n: number): Promise<T[]> {
  const out: T[] = new Array(taches.length);
  let i = 0;
  const ouvrier = async () => {
    while (i < taches.length) {
      const k = i++;
      out[k] = await taches[k]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, taches.length) }, ouvrier));
  return out;
}

/** Tri « naturel » des fichiers déposés : IMG_2.jpg avant IMG_10.jpg. */
export const parNom = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "fr", { numeric: true });
