// design-tokens-dette: R1 R14 → M11
// Landing publique de MyFlip.
//
// Direction visuelle : les tokens de l'app, pas ceux de la maquette HTML
// d'origine. Aucun hex en dur — l'accent est rgb(var(--accent)), qui vire au lime en
// thème sombre (cf. globals.css). Deux polices, déjà chargées par le layout :
// Space Grotesk pour les titres et le corps, JetBrains Mono pour tout ce qui
// est donnée ou micro-libellé. Ce contraste display serré / mono très espacé
// est la signature de l'app (le rail replié de la sidebar) — l'étendre ici est
// ce qui fait que la vitrine et le produit se reconnaissent.
//
// Composant serveur : seuls la nav (menu mobile) et la frise SKU sont clients.

import Link from "next/link";
import {
  Bot,
  Camera,
  FileSpreadsheet,
  Layers,
  Sparkles,
  SquareKanban,
  Tags,
  TrendingUp,
  Wallet,
} from "lucide-react";
import LandingNav from "./LandingNav";
import SkuLifecycle from "./SkuLifecycle";
import { lienApp } from "@/lib/hosts";

// ─────────────────────────────────────────────────────────────────────────
// Primitives
// ─────────────────────────────────────────────────────────────────────────

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent-text">
      {children}
    </p>
  );
}

function SectionHeader({
  eyebrow,
  titre,
  chapeau,
}: {
  eyebrow: string;
  titre: string;
  chapeau?: string;
}) {
  return (
    <div className="mx-auto mb-14 max-w-[680px] text-center">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-3 font-sans text-[clamp(1.7rem,3.6vw,2.4rem)] font-bold leading-[1.15] tracking-[-0.03em] text-ink">
        {titre}
      </h2>
      {chapeau && (
        <p className="mt-4 text-md leading-relaxed text-ink-2">
          {chapeau}
        </p>
      )}
    </div>
  );
}

function Section({
  id,
  children,
  className = "",
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={`border-b border-line px-5 py-20 sm:px-6 sm:py-24 ${className}`}
    >
      <div className="mx-auto max-w-[1200px]">{children}</div>
    </section>
  );
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-line bg-surface p-7 ${className}`}
    >
      {children}
    </div>
  );
}

function Jeton({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent-soft text-accent-text">
      {children}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Contenu
// ─────────────────────────────────────────────────────────────────────────

const PROBLEMES = [
  {
    titre: "Le tableur Excel saturé",
    texte:
      "Au début, un fichier Excel suffit. Après quelques lots, il devient illisible, lent, et n’est jamais mis à jour. Vous ne savez plus quelle formule calcule quoi.",
    icone: FileSpreadsheet,
  },
  {
    titre: "Le coût d’achat mal réparti",
    texte:
      "Si vous achetez un lot de 50 pièces pour 250 €, vous divisez souvent par 50 (5 €/pièce). Pourtant, un sweat à capuche lavé vaut plus qu’un t-shirt taché. Vos marges réelles par article sont faussées.",
    icone: Wallet,
  },
  {
    titre: "Le stock dormant invisible",
    texte:
      "Des dizaines d’articles dorment au fond de vos étagères depuis des mois sans que vous le remarquiez. L’argent est bloqué au lieu d’être réinvesti dans de nouveaux lots performants.",
    icone: Layers,
  },
];

const FONCTIONNALITES = [
  {
    titre: "Suivi précis par lot d’achat",
    texte:
      "Le coût du lot est réparti sur chaque pièce, et vous fixez un coefficient objectif. À tout moment, vous savez ce qu’il reste à récupérer pour rentabiliser la balle.",
    icone: Layers,
  },
  {
    titre: "Stock au SKU ultra-précis",
    texte:
      "Chaque pièce porte un identifiant unique et traverse dix statuts, du lavage à la vente. Plus de pièce oubliée au fond d’un carton.",
    icone: Tags,
  },
  {
    titre: "Marge réelle, pas approximative",
    texte:
      "Marge brute, marge nette après TVA sur marge, coefficient et panier moyen — calculés à la vente, sans ressaisie.",
    icone: TrendingUp,
  },
  {
    titre: "Assistant IA opérationnel",
    texte:
      "Un assistant qui agit : demandez-lui de passer trente articles en vente, il le fait après votre confirmation.",
    icone: Bot,
  },
  {
    titre: "Connecté à votre organisation",
    texte:
      "L’intégration Trello fait remonter vos cartes d’expédition dans la comptabilité, et repose l’étiquette une fois l’article validé.",
    icone: SquareKanban,
  },
  {
    titre: "Photographiez, c’est tout",
    texte:
      "Le parcours de mise en vente enchaîne photos, informations et annonce générée, étape par étape, sans page intermédiaire.",
    icone: Camera,
  },
];

const ETAPES = [
  {
    titre: "Enregistrez votre lot",
    texte:
      "Saisissez le prix d’achat global du lot fournisseur et définissez votre coefficient cible (ex : balle de 50 kg de sweats achetée 350 € avec objectif de 4x). MyFlip prépare votre lot de stock prêt à être trié.",
  },
  {
    titre: "Triez et photographiez",
    texte:
      "Attribuez à chaque vêtement un identifiant SKU. Photographiez-le et laissez l’IA générer la fiche descriptive complète et l’annonce de vente. MyFlip affecte un coût d’acquisition de base ajusté selon le potentiel de la pièce.",
  },
  {
    titre: "Vendez et pilotez",
    texte:
      "Publiez sur vos canaux de vente (Vinted, Vestiaire Collective). Dès qu’un article est vendu, MyFlip calcule la marge nette réelle déduite de toutes commissions et frais d’envois, et ajuste la rentabilité globale du lot.",
  },
];

const OFFRES = [
  {
    slug: "solo",
    nom: "Solo",
    prix: "9 €",
    chapeau:
      "Idéal pour démarrer votre activité de revendeur indépendant à temps partiel.",
    populaire: false,
    lignes: [
      "1 compte de vente",
      "Jusqu’à 100 articles en stock",
      "Stock, tableau de bord et calendrier des ventes",
      "30 annonces générées par IA / mois",
      "Export CSV des données",
    ],
  },
  {
    slug: "atelier",
    nom: "Atelier",
    prix: "29 €",
    chapeau:
      "Conçu pour les revendeurs professionnels établis cherchant à maximiser leur rentabilité.",
    populaire: true,
    lignes: [
      "3 comptes de vente",
      "Articles illimités en stock",
      "Gestion des lots d’achat et coefficient objectif",
      "300 annonces générées par IA / mois",
      "Statistiques avancées : rentabilité marque, rotation et projections",
      "Intégration Trello complète",
      "Assistant intelligent IA inclus",
    ],
  },
  {
    slug: "negoce",
    nom: "Négoce",
    prix: "59 €",
    chapeau:
      "Pour les entreprises de revente, friperies physiques et gros négociants de lots.",
    populaire: false,
    lignes: [
      "Comptes de vente illimités",
      "Annonces IA illimitées",
      "Modèles d’annonces 100 % personnalisables",
      "Rotation, stock dormant et marge par fournisseur",
      "Suivi complet des frais annexes et résultat net",
      "Support prioritaire et dédié",
    ],
  },
];

const FAQ = [
  {
    q: "Faut-il connecter mon compte Vinted ?",
    r: "Non, et c’est l’un de nos choix majeurs de sécurité. MyFlip ne se connecte jamais directement à Vinted ou Vestiaire Collective pour éviter tout risque de suspension ou de bannissement de vos comptes de vente professionnels. Vous gardez la main sur vos plateformes de vente ; MyFlip agit comme un assistant et un tableau de bord sécurisé à côté.",
  },
  {
    q: "Puis-je importer mon stock existant ?",
    r: "Absolument. Nous mettons à votre disposition un assistant d’importation intuitif. Vous pouvez charger vos fichiers CSV ou fichiers de tableurs existants (Excel, Numbers ou Google Sheets) pour transférer l’intégralité de votre stock sur MyFlip en quelques clics.",
  },
  {
    q: "Que se passe-t-il après la période d’essai de 14 jours ?",
    r: "L’essai est 100 % gratuit et sans aucun engagement. Comme nous ne demandons aucune carte bancaire pour démarrer l’essai, aucun prélèvement automatique n’aura lieu. À la fin des 14 jours, vous pourrez décider de vous abonner pour continuer à utiliser l’outil, ou laisser votre compte expirer sans frais.",
  },
  {
    q: "Mes données sont-elles à moi ?",
    r: "Oui, sans aucune restriction. Vos données de stock, de marges, de lots et de fournisseurs vous appartiennent à 100 %. Vous pouvez exporter l’intégralité de vos informations au format CSV en un clic à tout moment depuis vos paramètres de profil.",
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────

export default function Landing() {
  return (
    <div className="min-h-screen bg-bg">
      <LandingNav />

      <main>
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section className="border-b border-line px-5 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto grid max-w-[1200px] items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
            <div>
              <span className="inline-flex rounded-full border border-line bg-surface px-3.5 py-1.5 font-mono text-xs uppercase tracking-[0.14em] text-ink-2">
                Pour les revendeurs de vêtements d’occasion
              </span>

              <h1 className="mt-6 font-sans text-[clamp(2.3rem,6vw,4rem)] font-bold leading-[1.04] tracking-[-0.035em] text-ink">
                Pilotez vos marges de l’achat à la pièce.
              </h1>

              <p className="mt-6 max-w-[52ch] text-md leading-relaxed text-ink-2">
                Arrêtez de deviner. Le premier outil de gestion conçu pour les
                professionnels Vinted et Vestiaire Collective qui achètent en
                lots. Suivez vos achats fournisseurs, générez vos annonces par
                IA et maîtrisez enfin votre rentabilité réelle.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href={lienApp("/signup")}
                  className="flex min-h-12 items-center justify-center rounded-full bg-accent px-7 text-md font-bold text-accent-ink transition-colors hover:bg-accent-hover"
                >
                  Créer mon compte
                </Link>
                <a
                  href="#tarifs"
                  className="flex min-h-12 items-center justify-center rounded-full border border-line-strong px-7 text-md font-semibold text-ink transition-colors hover:bg-surface-2"
                >
                  Voir les tarifs
                </a>
              </div>
            </div>

            {/* La frise SKU : la thèse de la page, dite avec les données du
                métier plutôt qu'avec une illustration. */}
            <SkuLifecycle />
          </div>
        </section>

        {/* ── Le problème ──────────────────────────────────────────────── */}
        <Section id="probleme">
          <SectionHeader
            eyebrow="La réalité du terrain"
            titre="Pourquoi gérer vos lots de vêtements au feeling vous coûte cher."
            chapeau="Acheter des balles de fripes ou des stocks de déstockage est rentable, mais suivre la rentabilité de chaque pièce de façon artisanale est un cauchemar au quotidien."
          />
          <div className="grid gap-5 md:grid-cols-3">
            {PROBLEMES.map((p) => {
              const Icone = p.icone;
              return (
                <Card key={p.titre}>
                  <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-neg-soft text-neg">
                    <Icone className="h-5 w-5" strokeWidth={1.9} />
                  </span>
                  <h3 className="mt-5 font-sans text-lg font-bold tracking-[-0.01em] text-ink">
                    {p.titre}
                  </h3>
                  <p className="mt-2.5 text-base leading-relaxed text-ink-2">
                    {p.texte}
                  </p>
                </Card>
              );
            })}
          </div>
        </Section>

        {/* ── Fonctionnalités ──────────────────────────────────────────── */}
        <Section id="fonctionnalites">
          <SectionHeader
            eyebrow="Ce que fait MyFlip"
            titre="Conçu sur mesure pour le cycle de vie du vêtement de marque."
          />

          {/* La génération d'annonces garde le bloc pleine largeur que lui
              donnait la maquette : c'est la fonctionnalité phare. */}
          <Card className="mb-5 border-accent bg-accent-soft">
            <div className="grid items-center gap-8 lg:grid-cols-[1.15fr_0.85fr]">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 font-mono text-xs uppercase tracking-[0.14em] text-accent-ink">
                  <Sparkles className="h-3 w-3" strokeWidth={2.2} />
                  Fonctionnalité phare
                </span>
                <h3 className="mt-4 font-sans text-[clamp(1.35rem,2.6vw,1.75rem)] font-bold tracking-[-0.02em] text-ink">
                  Annonces générées par IA depuis vos photos
                </h3>
                <p className="mt-3 max-w-[54ch] text-md leading-relaxed text-ink-2">
                  Prenez vos photos, l’IA rédige le titre, la description et les
                  mots-clés. Titre saturé de mots-clés porteurs, description
                  structurée, état et matière annoncés — prêt à coller dans
                  votre annonce.
                </p>
              </div>

              <div className="rounded-lg border border-line bg-surface p-5">
                <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-3">
                  Titre généré
                </p>
                <p className="mt-2 text-base font-semibold leading-snug text-ink">
                  Polo Ralph Lauren vintage vert forêt — Taille L, coupe droite
                </p>
                <p className="mt-4 font-mono text-xs uppercase tracking-[0.14em] text-ink-3">
                  Mots-clés
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {["ralph lauren", "polo vintage", "y2k", "preppy"].map(
                    (t) => (
                      <span
                        key={t}
                        className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-xs text-ink-2"
                      >
                        {t}
                      </span>
                    ),
                  )}
                </div>
              </div>
            </div>
          </Card>

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {FONCTIONNALITES.map((f) => {
              const Icone = f.icone;
              return (
                <Card key={f.titre}>
                  <Jeton>
                    <Icone className="h-5 w-5" strokeWidth={1.9} />
                  </Jeton>
                  <h3 className="mt-5 font-sans text-md font-bold tracking-[-0.01em] text-ink">
                    {f.titre}
                  </h3>
                  <p className="mt-2.5 text-base leading-relaxed text-ink-2">
                    {f.texte}
                  </p>
                </Card>
              );
            })}
          </div>
        </Section>

        {/* ── Méthode ──────────────────────────────────────────────────── */}
        <Section id="methode">
          <SectionHeader
            eyebrow="La méthode MyFlip"
            titre="Trois étapes simples pour maîtriser votre rentabilité."
          />
          {/* Numérotation justifiée : c'est une vraie séquence, l'ordre porte
              de l'information. Rendue en mono, comme les codes du rail. */}
          <ol className="grid gap-8 md:grid-cols-3">
            {ETAPES.map((e, i) => (
              <li key={e.titre}>
                <span className="font-mono text-sm font-bold tracking-[0.12em] text-accent-text">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="mt-3 h-px w-full bg-line" />
                <h3 className="mt-5 font-sans text-lg font-bold tracking-[-0.015em] text-ink">
                  {e.titre}
                </h3>
                <p className="mt-2.5 text-base leading-relaxed text-ink-2">
                  {e.texte}
                </p>
              </li>
            ))}
          </ol>
        </Section>

        {/* ── Tarifs ───────────────────────────────────────────────────── */}
        <Section id="tarifs">
          <SectionHeader
            eyebrow="Les tarifs"
            titre="Une formule adaptée à l’envergure de votre stock."
            chapeau="Toutes nos formules incluent 14 jours d’essai gratuit, sans engagement, sans carte bancaire requise."
          />

          <div className="grid items-start gap-5 lg:grid-cols-3">
            {OFFRES.map((o) => (
              <div
                key={o.slug}
                className={`relative flex h-full flex-col rounded-lg border bg-surface p-7 ${
                  o.populaire
                    ? "border-accent ring-1 ring-accent"
                    : "border-line"
                }`}
              >
                {o.populaire && (
                  <span className="absolute -top-3 left-7 rounded-full bg-accent px-3 py-1 font-mono text-xs uppercase tracking-[0.12em] text-accent-ink">
                    Le plus populaire
                  </span>
                )}

                <h3 className="font-sans text-lg font-bold tracking-[-0.02em] text-ink">
                  {o.nom}
                </h3>

                <p className="mt-3 flex items-baseline gap-1.5">
                  <span className="font-mono text-2xl font-bold tabular-nums tracking-[-0.02em] text-ink">
                    {o.prix}
                  </span>
                  <span className="font-mono text-xs text-ink-3">
                    /mois TTC
                  </span>
                </p>

                <p className="mt-1 font-mono text-xs uppercase tracking-[0.12em] text-accent-text">
                  14 jours d’essai gratuit
                </p>

                <p className="mt-4 text-base leading-relaxed text-ink-2">
                  {o.chapeau}
                </p>

                <ul className="mt-6 flex flex-col gap-2.5 border-t border-line pt-6">
                  {o.lignes.map((l) => (
                    <li
                      key={l}
                      className="flex gap-2.5 text-base text-ink-2"
                    >
                      <span
                        aria-hidden
                        className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-accent"
                      />
                      <span>{l}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={lienApp(`/signup?plan=${o.slug}`)}
                  className={`mt-7 flex min-h-12 items-center justify-center rounded-full text-base font-bold transition-colors ${
                    o.populaire
                      ? "bg-accent text-accent-ink hover:bg-accent-hover"
                      : "border border-line-strong text-ink hover:bg-surface-2"
                  }`}
                >
                  Démarrer l’essai {o.nom}
                </Link>
              </div>
            ))}
          </div>

          <p className="mt-8 text-center text-base text-ink-2">
            Un compte de vente supplémentaire sur n’importe quelle formule : +6
            €/mois TTC.
          </p>
        </Section>

        {/* ── FAQ ──────────────────────────────────────────────────────── */}
        <Section id="faq">
          <SectionHeader
            eyebrow="Des réponses claires"
            titre="Foire aux questions"
            chapeau="Tout ce que vous devez savoir pour démarrer avec MyFlip sereinement."
          />
          {/* <details> natif : accessible au clavier et fonctionnel sans JS,
              là où la maquette pilotait l'ouverture en JavaScript. */}
          <div className="mx-auto flex max-w-[780px] flex-col gap-3">
            {FAQ.map((f) => (
              <details
                key={f.q}
                className="group rounded-lg border border-line bg-surface px-6"
              >
                <summary className="flex min-h-[60px] cursor-pointer list-none items-center justify-between gap-4 font-sans text-md font-semibold text-ink [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span
                    aria-hidden
                    className="font-mono text-lg font-normal text-accent-text transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="border-t border-line py-5 text-base leading-relaxed text-ink-2">
                  {f.r}
                </p>
              </details>
            ))}
          </div>
        </Section>

        {/* ── CTA final ────────────────────────────────────────────────── */}
        <Section className="text-center">
          <h2 className="mx-auto max-w-[18ch] font-sans text-[clamp(1.8rem,4.2vw,2.8rem)] font-bold leading-[1.1] tracking-[-0.03em] text-ink">
            Reprenez le contrôle de vos lots dès aujourd’hui.
          </h2>
          <Link
            href="/signup"
            className="mt-9 inline-flex min-h-[52px] items-center rounded-full bg-accent px-8 text-md font-bold text-accent-ink transition-colors hover:bg-accent-hover"
          >
            Créer mon compte
          </Link>
          <p className="mt-5 font-mono text-xs uppercase tracking-[0.14em] text-ink-3">
            14 jours d’essai · Sans engagement · Sans carte bancaire
          </p>
        </Section>
      </main>

      {/* ── Pied de page ───────────────────────────────────────────────── */}
      <footer className="px-5 py-14 sm:px-6">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div className="max-w-[42ch]">
            <div className="flex h-11 items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded bg-accent font-sans text-md font-bold text-accent-ink">
                M
              </span>
              <span className="font-sans text-lg font-bold tracking-[-0.02em] text-ink">
                MyFlip
              </span>
            </div>
            <p className="mt-4 text-base leading-relaxed text-ink-2">
              L’outil de gestion conçu pour optimiser la rentabilité des
              professionnels de la friperie et de l’achat-revente de marques
              d’occasion.
            </p>
          </div>

          <nav aria-label="Liens légaux">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-ink-3">
              Légal
            </p>
            <ul className="mt-2 flex flex-col">
              {[
                { href: "/legal/mentions-legales", label: "Mentions légales" },
                { href: "/legal/cgu", label: "CGU / CGV" },
                { href: "/legal/confidentialite", label: "Confidentialité" },
              ].map((l) => (
                <li key={l.href}>
                  {/* min-h-44 : cible tactile, règle mobile de CLAUDE.md. */}
                  <Link
                    href={l.href}
                    className="inline-flex min-h-11 items-center text-base text-ink-2 transition-colors hover:text-ink"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mx-auto mt-10 max-w-[1200px] border-t border-line pt-6">
          <p className="font-mono text-xs tracking-[0.06em] text-ink-3">
            © 2026 MyFlip. Tous droits réservés.
          </p>
        </div>
      </footer>
    </div>
  );
}
