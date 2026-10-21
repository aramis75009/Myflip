import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./tokens.css";
import "./globals.css";
import Providers from "./providers";
import AppShell from "@/components/AppShell";
import { AppToaster } from "@/components/ui/toaster";
import { SCRIPT_THEME } from "@/lib/themeMeta";

// Interface font (Space Grotesk) and monospace (JetBrains Mono: SKU, amounts).
// Their variables are set on <html> so that `:root` (app/tokens.css) can build
// --font-sans / --font-mono from them. Changing a font = changing these two
// imports, nothing else.
const ui = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-famille-ui",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-famille-mono",
  display: "swap",
});

export const metadata: Metadata = {
  // Each segment sets its own title (« Stock » → « Stock — MyFlip »);
  // TitreOnglet prefixes the « à comptabiliser » count.
  title: { template: "%s — MyFlip", default: "MyFlip" },
  description: "Suis tes achats, ventes et marges sur Vinted et Vestiaire.",
  // Follows the landing host once configured (Open Graph metadata of a
  // landing must point at the landing), then Vercel's production host, then
  // the app host.
  metadataBase: new URL(
    `https://${
      (process.env.NEXT_PUBLIC_LANDING_HOST || process.env.VERCEL_PROJECT_PRODUCTION_URL)?.trim().replace(/^https?:\/\//, "") ||
      "myflip-app.vercel.app"
    }`,
  ),
  icons: {
    icon: "/logo-atlas/myflip-favicon-32.png",
    apple: "/logo-atlas/myflip-icon-180.png",
  },
  openGraph: {
    title: "MyFlip",
    description: "Pilotage de revente de vêtements de marque.",
    locale: "fr_FR",
    type: "website",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "MyFlip",
  },
};

// viewport-fit=cover → l'app occupe toute la largeur sous l'encoche iPhone ;
// la bottom nav gère elle-même la safe area (env(safe-area-inset-bottom)).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // No themeColor here: <meta name="theme-color"> belongs to the inline theme
  // script and to appliquerTheme() (lib/themeMeta.ts). Declared here, Next
  // would rewrite it and React would report a hydration mismatch.
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={[ui.variable, mono.variable].join(" ")} suppressHydrationWarning>
      <body className="antialiased">
        {/* Theme, theme-color and sidebar state before the first paint. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_THEME }} />
        <Providers>
          {/* Before the frame: subscribed before any page effect fires a toast (X15). */}
          <AppToaster />
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
