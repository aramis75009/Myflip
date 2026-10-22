"use client";
// design-tokens-dette: R13 R14 → M11

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: next }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Une erreur est survenue.");
      } else {
        setDone(true);
        setTimeout(() => router.push("/login"), 2500);
      }
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setLoading(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-line bg-surface-2 px-4 py-3 text-base text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-accent focus:bg-surface";

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-lg border border-line bg-surface p-8 shadow-pop">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded bg-accent font-bold text-accent-ink text-lg">
            M
          </span>
          <div>
            <p className="font-bold text-ink">MyFlip</p>
            <p className="text-sm text-ink-3">Nouveau mot de passe</p>
          </div>
        </div>

        {done ? (
          <div className="rounded-lg bg-pos-soft px-4 py-4 text-base font-medium text-pos">
            Mot de passe mis à jour. Redirection vers la connexion…
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            {!token && (
              <p className="rounded-lg bg-neg-soft px-4 py-3 text-base text-neg">
                Lien invalide. Recommence la procédure depuis la page de connexion.
              </p>
            )}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-ink-3">
                Nouveau mot de passe
              </label>
              <input
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                placeholder="8 caractères minimum"
                required
                disabled={!token}
                className={inputCls}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-ink-3">
                Confirmer
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                required
                disabled={!token}
                className={inputCls}
              />
            </div>
            {error && (
              <p className="rounded-lg bg-neg-soft px-4 py-3 text-base text-neg">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading || !token}
              className="mt-1 w-full rounded-lg bg-accent py-3 text-base font-bold text-accent-ink shadow-pop transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              {loading ? "Mise à jour…" : "Mettre à jour le mot de passe"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
