import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Vitest ne couvre QUE la logique pure : les fonctions sans React, sans fetch
 * et sans DOM. C'est un choix, pas une limite d'outillage — le rendu et les
 * appels réseau se vérifient à la main (cf. le plan de test de la revue).
 *
 * `vite-tsconfig-paths` est obligatoire : `tsconfig.json` déclare l'alias
 * `@/*`, que Vitest ne lit pas tout seul. Sans ce plugin, tout import
 * `@/lib/...` dans un test échoue à la résolution.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts", "extension-vinted/**/*.test.js"],
  },
});
