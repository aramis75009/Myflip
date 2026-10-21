// design-tokens-dette: R14 → M11
export default function ConfidentialitePage() {
  return (
    <main className="min-h-screen bg-bg px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 font-sans text-xl font-bold text-ink">
          Politique de confidentialité
        </h1>
        <div className="rounded-lg border border-line bg-surface p-8">
          <ul className="space-y-3 text-base leading-relaxed text-ink-3">
            <li>
              <span className="font-semibold text-ink">Données collectées</span>{" "}
              : email, données de ventes et stock.
            </li>
            <li>
              <span className="font-semibold text-ink">Finalité</span>{" "}
              : pilotage personnel de l&apos;activité de revente.
            </li>
            <li>
              <span className="font-semibold text-ink">Hébergement</span>{" "}
              : Neon (PostgreSQL) — serveurs EU.
            </li>
            <li>
              <span className="font-semibold text-ink">
                Durée de conservation
              </span>{" "}
              : jusqu&apos;à suppression du compte.
            </li>
            <li>Aucune donnée partagée avec des tiers.</li>
            <li>
              Contact :{" "}
              <a
                href="mailto:aramis.begnene@gmail.com"
                className="text-accent-text underline-offset-2 hover:underline"
              >
                aramis.begnene@gmail.com
              </a>
            </li>
          </ul>
        </div>
      </div>
    </main>
  );
}
