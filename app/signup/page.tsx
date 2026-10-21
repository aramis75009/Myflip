"use client";
// design-tokens-dette: R13 R14 → M11

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

// Libellés des offres de la landing. Sert uniquement à confirmer à l'utilisateur
// le bouton qu'il a cliqué — aucun quota n'en découle aujourd'hui.
const PLANS: Record<string, string> = {
  solo: "Solo",
  atelier: "Atelier",
  negoce: "Négoce",
};

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const plan = params.get("plan") ?? "";
  const planLabel = PLANS[plan];

  const [prenom, setPrenom] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prenom, email, password, code, plan }),
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(data?.error ?? "La création du compte a échoué.");
      setLoading(false);
      return;
    }

    // Compte créé : on connecte directement plutôt que de renvoyer vers /login
    // avec des identifiants à ressaisir.
    const login = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);

    if (login?.error) {
      setError("Compte créé, mais la connexion a échoué. Essaie de te connecter.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  const inputCls =
    "mb-4 w-full rounded-lg border border-line bg-surface-2 px-4 py-3 text-base text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-accent focus:bg-surface";
  const labelCls =
    "mb-1.5 block text-sm font-semibold text-ink-3";

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-sm rounded-lg border border-line bg-surface p-8 shadow-pop">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded bg-accent text-lg font-bold text-accent-ink">
            M
          </span>
          <div>
            <p className="font-bold text-ink">MyFlip</p>
            <p className="text-sm text-ink-3">
              {planLabel ? `Créer ton compte ${planLabel}` : "Créer ton compte"}
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col">
          <label htmlFor="prenom" className={labelCls}>
            Prénom
          </label>
          <input
            id="prenom"
            type="text"
            required
            autoComplete="given-name"
            value={prenom}
            onChange={(e) => setPrenom(e.target.value)}
            className={inputCls}
          />

          <label htmlFor="email" className={labelCls}>
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
          />

          <label htmlFor="password" className={labelCls}>
            Mot de passe
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby="password-aide"
            className={inputCls}
          />
          <p
            id="password-aide"
            className="-mt-2.5 mb-4 text-xs text-ink-3"
          >
            8 caractères minimum.
          </p>

          <label htmlFor="code" className={labelCls}>
            Code d&apos;invitation
          </label>
          <input
            id="code"
            type="text"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Fourni par MyFlip"
            className={`${inputCls} font-mono uppercase tracking-[0.08em]`}
          />

          {error && (
            <p
              role="alert"
              className="mb-4 rounded-lg bg-neg-soft px-4 py-2.5 text-base text-neg"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-accent py-3 text-base font-bold text-accent-ink shadow-pop transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {loading ? "Création…" : "Créer mon compte"}
          </button>

          {/* min-h-44 : cible tactile, règle mobile de CLAUDE.md. */}
          <Link
            href="/login"
            className="mt-2 flex min-h-11 items-center justify-center text-sm text-ink-3 transition-colors hover:text-ink-3"
          >
            J&apos;ai déjà un compte
          </Link>
        </form>
      </div>
    </main>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
