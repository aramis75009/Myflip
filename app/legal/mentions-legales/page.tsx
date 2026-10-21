// design-tokens-dette: R14 → M11
export default function MentionsLegalesPage() {
  return (
    <main className="min-h-screen bg-bg px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 font-sans text-xl font-bold text-ink">
          Mentions légales
        </h1>
        <div className="rounded-lg border border-line bg-surface p-8">
          <div className="space-y-5 text-base leading-relaxed text-ink-3">
            <div>
              <p className="mb-1 font-semibold text-ink">Éditeur</p>
              <p>Aramis Begnene</p>
              <p>
                Contact :{" "}
                <a
                  href="mailto:aramis.begnene@gmail.com"
                  className="text-accent-text underline-offset-2 hover:underline"
                >
                  aramis.begnene@gmail.com
                </a>
              </p>
            </div>
            <div>
              <p className="mb-1 font-semibold text-ink">Hébergement</p>
              <p>Vercel Inc.</p>
              <p>340 Pine Street, San Francisco, CA 94104, États-Unis</p>
            </div>
            <div>
              <p className="mb-1 font-semibold text-ink">Base de données</p>
              <p>Neon Inc.</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
