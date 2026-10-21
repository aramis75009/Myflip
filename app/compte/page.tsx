"use client";
// design-tokens-dette: R13 → M10

import { useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { CardTitle, Frame, Module } from "@/components/console";
import Integrations from "@/components/compte/Integrations";
import { useObjectifMensuel } from "@/lib/hooks";
import { euros } from "@/lib/calc";

// Deux premières lettres de la partie locale de l'e-mail. La maquette pose un
// pavé d'initiales à la place d'un avatar ; on n'a pas de nom en base, donc
// l'e-mail est la seule source disponible.
function initiales(email: string | null): string {
  return (email?.split("@")[0] ?? "").slice(0, 2).toUpperCase() || "··";
}

/** Tuile creusée de la maquette : micro-libellé mono, valeur en 15px/600. */
function Tuile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface-2 p-3.5">
      <div className="font-mono text-xs uppercase tracking-[0.14em] text-ink-3">
        {label}
      </div>
      <div className="mt-1.5 text-md font-semibold">{value}</div>
    </div>
  );
}

export default function ComptePage() {
  const { data: session } = useSession();
  const email = session?.user?.email ?? null;

  // Objectif porté par le compte, plus par le navigateur.
  const { objectif } = useObjectifMensuel();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (next !== confirm) {
      toast.error("Les nouveaux mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/user/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Une erreur est survenue.");
      } else {
        toast.success("Mot de passe mis à jour avec succès.");
        setCurrent("");
        setNext("");
        setConfirm("");
      }
    } catch {
      toast.error("Impossible de contacter le serveur.");
    } finally {
      setLoading(false);
    }
  }

  const labelCls =
    "font-mono text-xs uppercase tracking-[0.14em] text-ink-3";
  const inputCls =
    "min-h-[46px] w-full rounded-md border border-line bg-surface-2 px-4 text-base text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-accent";

  return (
    <Frame>
      <section className="grid grid-cols-1 gap-3.5 min-[900px]:grid-cols-2">
        {/* Identité */}
        <Module className="p-6">
          <div className="flex items-center gap-4">
            <span className="flex h-[66px] w-[66px] flex-none items-center justify-center rounded-lg bg-accent text-xl font-bold text-accent-ink">
              {initiales(email)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-lg font-bold tracking-[-0.02em]">
                {email?.split("@")[0] ?? "—"}
              </span>
              <span className="mt-[3px] block truncate font-mono text-xs text-ink-3">
                {email ?? "—"}
              </span>
            </span>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2.5">
            <Tuile
              label="Objectif mensuel"
              value={objectif != null ? euros(objectif) : "Non défini"}
            />
            <Tuile label="Authentification" value="Mot de passe" />
          </div>

          <Link
            href="/parametres"
            className="mt-3 flex min-h-[46px] w-full items-center justify-center rounded-md border border-line bg-surface-2 text-base text-ink-2 transition-colors hover:border-line-strong"
          >
            Modifier l&apos;objectif mensuel
          </Link>
        </Module>

        {/* Sécurité */}
        <Module className="p-6">
          <div className="mb-3.5 flex items-center gap-2.5">
            <Lock className="h-[18px] w-[18px] text-accent-text" strokeWidth={2} />
            <CardTitle className="">Changer le mot de passe</CardTitle>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Mot de passe actuel</label>
              <input
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                placeholder="••••••••"
                required
                className={inputCls}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Nouveau mot de passe</label>
              <input
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                placeholder="8 caractères minimum"
                required
                className={inputCls}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Confirmer le nouveau mot de passe</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                required
                className={inputCls}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-1 inline-flex min-h-[46px] items-center justify-center rounded-md bg-accent px-5 text-base font-semibold text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              {loading ? "Mise à jour…" : "Mettre à jour"}
            </button>
          </form>
        </Module>
      </section>

      <Integrations />
    </Frame>
  );
}
