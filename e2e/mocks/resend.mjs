// Faux Resend de la suite e2e : http://127.0.0.1:<4014+D> (RESEND_BASE_URL,
// que le SDK resend lit tel quel). Rien ne part : POST /emails répond
// { id: "e2e-email-<n>" } et garde destinataire et sujet pour les assertions
// (GET /__e2e/appels). Le corps HTML n'est pas conservé : il peut contenir un
// lien de réinitialisation.
//
// Lancement : E2E_PORT_MOCK=4014 node e2e/mocks/resend.mjs

import { demarrerFauxServeur, portDepuisEnv } from "./commun.mjs";

demarrerFauxServeur({
  nom: "Resend factice",
  port: portDepuisEnv(4014),
  gerer: ({ req, url, json, appel }) => {
    if (req.method === "POST" && url.pathname === "/emails") {
      appel.type = "email";
      appel.a = json?.to ?? null;
      appel.sujet = json?.subject ?? null;
      return { statut: 200, json: { id: `e2e-email-${appel.n}` } };
    }
    return null;
  },
});
