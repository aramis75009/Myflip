// design-tokens-dette: R14 → M11
export default function CguPage() {
  return (
    <main className="min-h-screen bg-bg px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 font-sans text-xl font-bold text-ink">
          Conditions générales d&apos;utilisation
        </h1>
        <div className="rounded-lg border border-line bg-surface p-8">
          <ul className="space-y-3 text-base leading-relaxed text-ink-3">
            <li>
              MyFlip est un outil personnel de pilotage de revente de vêtements.
            </li>
            <li>L&apos;accès est réservé aux utilisateurs autorisés.</li>
            <li>
              L&apos;utilisateur s&apos;engage à ne pas partager ses identifiants.
            </li>
            <li>Les données saisies appartiennent à l&apos;utilisateur.</li>
            <li>
              L&apos;éditeur se réserve le droit de modifier ou interrompre le
              service.
            </li>
          </ul>
        </div>
      </div>
    </main>
  );
}
