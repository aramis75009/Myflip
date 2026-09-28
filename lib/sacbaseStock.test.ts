import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { verifierJetonSacbase } from "./sacbaseAuth";
import { jourParis, reponseSacbase, whereSacbase } from "./sacbaseStock";

// GET /api/sacbase/stock — contrat figé côté SacBase (spec SacBase §3.5) :
// SacBase REJETTE toute la réponse au moindre écart. Ces tests sont le contrat.

const env = { SACBASE_API_TOKEN: "s3cret-token", SACBASE_USER_EMAIL: "Aramis@Example.com " };
const bearer = (t: string) => `Bearer ${t}`;

describe("verifierJetonSacbase", () => {
  it("503 sans l'une des deux variables", () => {
    expect(verifierJetonSacbase({}, bearer("x"))).toEqual({ ok: false, status: 503, error: "SacBase API non configurée" });
    expect(verifierJetonSacbase({ SACBASE_API_TOKEN: "t" }, bearer("t"))).toMatchObject({ ok: false, status: 503 });
    expect(verifierJetonSacbase({ SACBASE_USER_EMAIL: "a@b.c" }, bearer("t"))).toMatchObject({ ok: false, status: 503 });
  });
  it("401 sans jeton ou avec un mauvais jeton, même message", () => {
    const refus = { ok: false, status: 401, error: "Non autorisé" };
    expect(verifierJetonSacbase(env, null)).toEqual(refus);
    expect(verifierJetonSacbase(env, "Basic abc")).toEqual(refus);
    expect(verifierJetonSacbase(env, bearer("s3cret-tokeN"))).toEqual(refus);
    expect(verifierJetonSacbase(env, bearer("court"))).toEqual(refus);
  });
  it("ok avec le bon jeton : rend l'e-mail normalisé", () => {
    expect(verifierJetonSacbase(env, bearer("s3cret-token"))).toEqual({ ok: true, email: "aramis@example.com" });
  });
});

describe("whereSacbase", () => {
  it("articles de l'utilisateur ciblé, commande Hipobuy sans tenir compte de la casse", () => {
    expect(whereSacbase("u1")).toEqual({
      userId: "u1",
      commande: { fournisseur: { contains: "hipobuy", mode: "insensitive" } },
    });
  });
});

describe("jourParis", () => {
  it("27/09 à 23 h 30 à Paris (21:30Z) sort en 2026-09-27", () => {
    expect(jourParis(new Date("2026-09-27T21:30:00.000Z"))).toBe("2026-09-27");
  });
  it("00 h 30 à Paris le 28/09 (22:30Z la veille) sort en 2026-09-28", () => {
    expect(jourParis(new Date("2026-09-27T22:30:00.000Z"))).toBe("2026-09-28");
  });
  it("null reste null", () => {
    expect(jourParis(null)).toBeNull();
  });
});

describe("reponseSacbase", () => {
  const rows = [
    { sku: "SDN10", statut: "En vente", compteVente: "VINTED_SECOND" as const, prixVente: null, dateVente: null, dateMiseEnVente: new Date("2026-09-25T08:00:00.000Z") },
    // Mis en vente le 20/09 à 23 h 30 heure de Paris, vendu le 27/09 à 23 h 30.
    { sku: "SDN2", statut: "Vendu", compteVente: "VINTED_SECOND" as const, prixVente: 45, dateVente: new Date("2026-09-27T21:30:00.000Z"), dateMiseEnVente: new Date("2026-09-20T21:30:00.000Z") },
    { sku: "SDN1", statut: "En livraison", compteVente: null, prixVente: null, dateVente: null, dateMiseEnVente: null },
  ];
  const now = new Date("2026-09-29T14:02:11.000Z");
  const r = reponseSacbase(rows, now);

  it("genere_le et comptes", () => {
    expect(r.genere_le).toBe("2026-09-29T14:02:11.000Z");
    expect(r.comptes).toEqual([
      { id: "VINTED_PRO", label: "Fripandtrend" },
      { id: "VINTED_SECOND", label: "Enorab18" },
      { id: "VESTIAIRE_COLLECTIVE", label: "Vestiaire Collective" },
    ]);
  });
  it("tri naturel des SKU (SDN2 avant SDN10)", () => {
    expect(r.articles.map((a) => a.sku)).toEqual(["SDN1", "SDN2", "SDN10"]);
  });
  it("exactement les 6 clés du contrat, dates en jour Paris", () => {
    for (const a of r.articles)
      expect(Object.keys(a).sort()).toEqual(["compte", "dateMiseEnVente", "dateVente", "prixVente", "sku", "statut"]);
    expect(r.articles[1]).toEqual({ sku: "SDN2", statut: "Vendu", compte: "VINTED_SECOND", prixVente: 45, dateVente: "2026-09-27", dateMiseEnVente: "2026-09-20" });
    expect(r.articles[0]).toEqual({ sku: "SDN1", statut: "En livraison", compte: null, prixVente: null, dateVente: null, dateMiseEnVente: null });
  });
});

describe("route /api/sacbase/stock", () => {
  it("n'expose que GET", () => {
    const src = readFileSync(path.join(__dirname, "../app/api/sacbase/stock/route.ts"), "utf8");
    const methodes = [...src.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)].map((m) => m[1]);
    expect(methodes).toEqual(["GET"]);
  });
});
