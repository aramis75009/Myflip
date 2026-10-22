/** @type {import('next').NextConfig} */
const nextConfig = {
  // `NEXT_DIST_DIR` n'est posée que par la suite e2e (playwright.config.ts) :
  // son `next dev` écrit dans `.next-e2e-<port>.nosync` et ne touche jamais au
  // `.next` du `npm run dev` habituel. Deux serveurs sur le même dossier de
  // build le corrompent. Absente = `.next`, comme avant.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    serverActions: { bodySizeLimit: "20mb" },
  },
};

export default nextConfig;
