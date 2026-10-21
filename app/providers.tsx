"use client";

import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { useState } from "react";

import { estStatut } from "@/lib/hooks";
import { toastErreur } from "@/lib/toast";

/**
 * Data layer of the app.
 *
 * - Queries: one retry at most, after 800 ms, and none on 401 / 403 / 404
 *   (a missing session or page does not come back by retrying).
 * - Mutations: a failure is SEEN. Unless the hook says its callers already
 *   show the error (`meta.erreurLocale`), it becomes an error toast, prefixed
 *   by `meta.objet` (« Modification non enregistrée : … »). A 401 already has
 *   its own toast (lib/hooks.ts, jsonFetch).
 */
export default function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: false,
            retry: (echecs, erreur) => !estStatut(erreur, 401, 403, 404) && echecs < 1,
            retryDelay: 800,
          },
        },
        mutationCache: new MutationCache({
          onError: (erreur, _variables, _contexte, mutation) => {
            if (mutation.meta?.erreurLocale === true || estStatut(erreur, 401)) return;
            const message = erreur instanceof Error && erreur.message ? erreur.message : "Une erreur est survenue.";
            const objet = typeof mutation.meta?.objet === "string" ? mutation.meta.objet : null;
            toastErreur(objet ? `${objet} : ${message}` : message);
          },
        }),
      }),
  );

  return (
    <SessionProvider>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </SessionProvider>
  );
}
