"use client";
// design-tokens-dette: R2 R4 R5 R6 R12 R16 → L2b

type Props = {
  label?: string;
  size?: "sm" | "md";
};

// Deux gabarits complets plutôt que cinq ternaires parallèles : une taille se
// lit ici d'un bloc, et en ajouter une ne se fait qu'à un seul endroit.
const GABARITS = {
  sm: { svg: 48, pad: 10, radius: 18, py: "py-8", fontSize: 13 },
  md: { svg: 72, pad: 14, radius: 24, py: "py-16", fontSize: 14 },
} as const;

export default function Loader({ label = "Chargement", size = "md" }: Props) {
  const g = GABARITS[size];

  return (
    <div className={`flex flex-col items-center justify-center ${g.py} gap-4`}>
      <div
        style={{
          display: "inline-flex",
          padding: g.pad,
          borderRadius: g.radius,
          // La tuile porte son propre fond sombre : le M mint et sa lueur ne
          // sont lisibles que là-dessus. Elle ne doit donc PAS suivre le thème.
          //
          // Le dégradé finissait sur rgb(var(--ink)), qui vaut #0e1412 en clair mais
          // #eaf1ec en sombre : la tuile virait au blanc dès qu'on basculait le
          // thème, et le logo mint disparaissait dessus. Fin de dégradé en dur.
          background:
            "radial-gradient(120% 120% at 50% 0%, #214f3b 0%, #0e1412 100%)",
        }}
      >
        <svg width={g.svg} height={g.svg} viewBox="0 0 96 96" fill="none">
          {/* Rail du tracé, sous le M animé. Littéral pour la même raison que
              la tuile : rgb(var(--pos)) ne se voyait qu'en thème sombre (#5fd39b) et
              disparaissait en clair (#0f5132 posé sur #0e1412). */}
          <path
            d="M27 69 V31 L48 54 L69 31 V69"
            fill="none"
            stroke="#5fd39b"
            strokeWidth="8.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.28"
          />
          <path
            d="M27 69 V31 L48 54 L69 31 V69"
            fill="none"
            stroke="#A8D5B5"
            strokeWidth="8.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength="100"
            style={{
              strokeDasharray: 100,
              animation: "atlas-draw 2.1s cubic-bezier(.65,.05,.36,1) infinite",
              filter: "drop-shadow(0 0 5px rgba(168,213,181,.45))",
            }}
          />
        </svg>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 3,
          fontFamily: "'Space Grotesk', sans-serif",
          fontWeight: 600,
          fontSize: g.fontSize,
          color: "rgb(var(--ink))",
          letterSpacing: "-0.01em",
        }}
      >
        {label}
        <span style={{ display: "inline-flex", gap: 3, marginLeft: 1 }}>
          {([0, 0.2, 0.4] as const).map((delay, i) => (
            <span
              key={i}
              style={{
                display: "inline-block",
                width: 3,
                height: 3,
                borderRadius: "50%",
                background: "rgb(var(--pos))",
                animation: "atlas-dots 1.4s infinite",
                animationDelay: `${delay}s`,
              }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}
