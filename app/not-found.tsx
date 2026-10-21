// design-tokens-dette: R14 → L2b
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-bg px-5 text-center">
      <div className="font-sans text-3xl font-bold leading-none text-accent-text">
        404
      </div>
      <p className="mt-4 text-lg font-medium text-ink-3">
        Cette page n&apos;existe pas.
      </p>
      <Link
        href="/dashboard"
        className="mt-8 inline-flex items-center rounded-lg bg-accent px-6 py-3 text-base font-bold text-accent-ink shadow-pop transition-colors hover:bg-accent-hover"
      >
        ← Retour au dashboard
      </Link>
    </main>
  );
}
