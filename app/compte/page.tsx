"use client";

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
    <div className="rounded-[16px] bg-[var(--surface-2)] p-3.5">
      <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--faint)]">
        {label}
      </div>
      <div className="mt-1.5 text-[15px] font-semibold">{value}</div>
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
    "font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--faint)]";
  const inputCls =
    "min-h-[46px] w-full rounded-[16px] border border-[var(--border)] bg-[var(--surface-2)] px-4 text-[14px] text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--faint-2)] focus:border-[var(--acc)]";

  return (
    <Frame>
      <section className="grid grid-cols-1 gap-[14px] min-[900px]:grid-cols-2">
        {/* Identité */}
        <Module className="p-[24px]">
          <div className="flex items-center gap-4">
            <span className="flex h-[66px] w-[66px] flex-none items-center justify-center rounded-[22px] bg-[var(--acc)] text-[24px] font-bold text-[var(--acc-ink)]">
              {initiales(email)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[20px] font-bold tracking-[-0.02em]">
                {email?.split("@")[0] ?? "—"}
              </span>
              <span className="mt-[3px] block truncate font-mono text-[11px] text-[var(--faint)]">
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
            className="mt-3 flex min-h-[46px] w-full items-center justify-center rounded-[16px] border border-[var(--border)] bg-[var(--surface-2)] text-[13.5px] text-[var(--ink2)] transition-colors hover:border-[var(--border-strong)]"
          >
            Modifier l&apos;objectif mensuel
          </Link>
        </Module>

        {/* Sécurité */}
        <Module className="p-[24px]">
          <div className="mb-[14px] flex items-center gap-2.5">
            <Lock className="h-[18px] w-[18px] text-[var(--acc)]" strokeWidth={2} />
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
              className="mt-1 inline-flex min-h-[46px] items-center justify-center rounded-[16px] bg-[var(--acc)] px-5 text-[13.5px] font-semibold text-[var(--acc-ink)] transition-colors hover:bg-[var(--acc-hover)] disabled:opacity-60"
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
