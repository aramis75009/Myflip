"use client";
// design-tokens-dette: R13 R14 → M11

import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") ?? "/dashboard";

  const [mode, setMode] = useState<"login" | "forgot">("login");

  // Login
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Forgot
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotDone, setForgotDone] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Identifiants invalides.");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  async function onForgot(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setForgotLoading(true);
    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: forgotEmail }),
    });
    setForgotLoading(false);
    setForgotDone(true);
  }

  const inputCls =
    "mb-4 w-full rounded-lg border border-line bg-surface-2 px-4 py-3 text-base text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-accent focus:bg-surface";

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-lg border border-line bg-surface p-8 shadow-pop">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded bg-accent font-bold text-accent-ink text-lg">
            M
          </span>
          <div>
            <p className="font-bold text-ink">MyFlip</p>
            <p className="text-sm text-ink-3">
              {mode === "login" ? "Connecte-toi pour continuer." : "Réinitialiser ton mot de passe"}
            </p>
          </div>
        </div>

        {mode === "login" ? (
          <form onSubmit={onSubmit} className="flex flex-col">
            <label className="mb-1.5 block text-sm font-semibold text-ink-3">
              Email
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
            />
            <label className="mb-1.5 block text-sm font-semibold text-ink-3">
              Mot de passe
            </label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls}
            />
            {error && (
              <p className="mb-4 rounded-lg bg-neg-soft px-4 py-2.5 text-base text-neg">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-accent py-3 text-base font-bold text-accent-ink shadow-pop transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              {loading ? "Connexion…" : "Se connecter"}
            </button>
            <button
              type="button"
              onClick={() => { setMode("forgot"); setError(null); }}
              className="mt-4 text-center text-sm text-ink-3 transition-colors hover:text-ink-3"
            >
              Mot de passe oublié ?
            </button>
          </form>
        ) : forgotDone ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-pos-soft px-4 py-4 text-base font-medium text-pos">
              Si cet email est enregistré, un lien de réinitialisation a été envoyé.
            </div>
            <button
              onClick={() => { setMode("login"); setForgotDone(false); setForgotEmail(""); }}
              className="text-sm text-ink-3 transition-colors hover:text-ink-3"
            >
              ← Retour à la connexion
            </button>
          </div>
        ) : (
          <form onSubmit={onForgot} className="flex flex-col">
            <label className="mb-1.5 block text-sm font-semibold text-ink-3">
              Ton adresse email
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
              placeholder="aramis@exemple.com"
              className={inputCls}
            />
            <button
              type="submit"
              disabled={forgotLoading}
              className="w-full rounded-lg bg-accent py-3 text-base font-bold text-accent-ink shadow-pop transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              {forgotLoading ? "Envoi…" : "Envoyer le lien"}
            </button>
            <button
              type="button"
              onClick={() => setMode("login")}
              className="mt-4 text-center text-sm text-ink-3 transition-colors hover:text-ink-3"
            >
              ← Retour à la connexion
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
