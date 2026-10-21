import { describe, expect, it } from "vitest";

import { STATUTS } from "./calc";
import { cleStatut, statutColor, statutMarker, styleStatut, type CleStatut } from "./statutColors";

const ATTENDU: Record<(typeof STATUTS)[number], CleStatut> = {
  Brouillon: "brouillon",
  "En stock": "stock",
  "Photos prêtes": "photos",
  "En vente": "vente",
  "En livraison": "livraison",
  "À comptabiliser": "compta",
  Vendu: "vendu",
  "En lavage": "lavage",
  "Repassé": "repasse",
  Perdu: "perdu",
};

describe("statutColors", () => {
  it("maps each of the ten statuses to its key", () => {
    expect(STATUTS).toHaveLength(10);
    for (const statut of STATUTS) expect(cleStatut(statut)).toBe(ATTENDU[statut]);
  });

  it("falls back to brouillon for an unknown status", () => {
    expect(cleStatut("Inconnu")).toBe("brouillon");
    expect(styleStatut("").cle).toBe("brouillon");
  });

  it("every class string names the status key (written in full for Tailwind)", () => {
    for (const statut of STATUTS) {
      const s = styleStatut(statut);
      const cle = ATTENDU[statut];
      expect(s.cle).toBe(cle);
      expect(s.pastille).toBe(`bg-st-${cle}-soft text-st-${cle}-ink`);
      expect(s.texte).toBe(`text-st-${cle}-ink`);
      expect(s.repere).toBe(`bg-st-${cle}`);
      expect(s.trait).toBe(`border-st-${cle}`);
      expect(s.remplissage).toBe(`fill-st-${cle}`);
    }
  });

  it("keeps the deprecated inline helpers, on tokens only", () => {
    expect(statutColor("En vente")).toEqual({
      color: "rgb(var(--st-vente))",
      bg: "rgb(var(--st-vente-soft))",
      ink: "rgb(var(--st-vente-ink))",
    });
    expect(statutMarker("Vendu")).toBe("rgb(var(--st-vendu))");
    expect(statutMarker("???")).toBe("rgb(var(--st-brouillon))");
  });
});
