import { describe, expect, it } from "vitest";
import {
  PRISES,
  choixAutomatique,
  cleCase,
  etatCase,
  etatsDesCases,
  ligneCouverte,
  nomPrise,
  passeFiltres,
  prisesPour,
  promptVariante,
  sacsCibles,
  sansFreresDuLancement,
  usageAngles,
  type EssaiCase,
} from "./studioCases";

const statuts: Record<string, string> = { SDN9: "Vendu", SDN12: "En vente", SDN15: "Photos prêtes", SDN16: "En stock" };
const statutDe = (sku: string) => statuts[sku] ?? null;
const e = (referenceId: string, angleId: string, decision: string | null, skuCible: string | null = "SDN15"): EssaiCase => ({
  referenceId,
  angleId,
  decision,
  skuCible,
});

describe("prises", () => {
  it("14 prises fixes plus une libre, nommées par leur numéro", () => {
    expect(PRISES).toHaveLength(15);
    expect(nomPrise(1)).toBe("Face");
    expect(nomPrise(14)).toBe("Dessous");
    expect(nomPrise(16)).toBe("Prise 16");
  });

  it("les V3 ont leur propre liste, de même longueur ; V1 et V2 gardent la liste de base", () => {
    expect(prisesPour("V3")).toHaveLength(PRISES.length);
    expect(nomPrise(2, "V3")).toBe("Face · lettrage ELITE");
    expect(nomPrise(5, "V3")).toBe("Compartiment principal ouvert");
    expect(nomPrise(6, "V3")).toBe("Dos");
    expect(nomPrise(2, "V1")).toBe("Face · détail gauche");
    expect(nomPrise(2, "V2")).toBe("Face · détail gauche");
    expect(nomPrise(2, null)).toBe("Face · détail gauche");
  });
});

describe("promptVariante", () => {
  it("met le prompt maître en tête, puis le prompt d'angle", () => {
    expect(promptVariante(" Maître. ", " Angle: 4° clockwise. ")).toBe("Maître.\n\nAngle: 4° clockwise.");
  });
  it("sans prompt maître, n'envoie que l'angle", () => {
    expect(promptVariante("  ", "Angle: closer.")).toBe("Angle: closer.");
  });
});

describe("etatCase", () => {
  it("libre sans essai", () => {
    expect(etatCase([], statutDe)).toEqual({ kind: "libre" });
  });
  it("redevient libre quand tous ses essais sont rejetés (décision 1)", () => {
    expect(etatCase([e("r", "a", "rejete"), e("r", "a", "rejete")], statutDe)).toEqual({ kind: "libre" });
  });
  it("à juger tant qu'un essai attend la décision", () => {
    expect(etatCase([e("r", "a", "rejete"), e("r", "a", null)], statutDe)).toEqual({ kind: "a_juger" });
  });
  it("validée pour un sac encore sans annonce", () => {
    expect(etatCase([e("r", "a", "valide", "SDN15")], statutDe)).toEqual({ kind: "validee", sku: "SDN15" });
  });
  it("en vente dès que le sac cible a son annonce (en vente ou vendu)", () => {
    expect(etatCase([e("r", "a", "valide", "SDN12")], statutDe)).toEqual({ kind: "vente", sku: "SDN12" });
    expect(etatCase([e("r", "a", "valide", "SDN9")], statutDe)).toEqual({ kind: "vente", sku: "SDN9" });
  });
  it("un SKU inconnu du stock garde la case verrouillée, comme validée", () => {
    expect(etatCase([e("r", "a", "valide", "SDN99")], statutDe)).toEqual({ kind: "validee", sku: "SDN99" });
  });
  it("« en vente » l'emporte sur un autre essai à juger", () => {
    expect(etatCase([e("r", "a", null), e("r", "a", "valide", "SDN12")], statutDe)).toEqual({ kind: "vente", sku: "SDN12" });
  });
});

describe("tableau et choix automatique", () => {
  const lignes = [{ id: "r1" }, { id: "r2" }, { id: "r3" }, { id: "r4" }];
  const angles = [{ id: "v1" }, { id: "v2" }, { id: "v3" }];
  const essais = [
    e("r1", "v1", "valide", "SDN12"), // en vente
    e("r2", "v1", "valide", "SDN12"),
    e("r2", "v2", "valide", "SDN15"), // r2 couverte pour SDN15
    e("r3", "v1", "valide", "SDN12"),
    e("r3", "v2", null, "SDN15"), // r3 couverte (à juger)
    e("r4", "v1", "rejete", "SDN15"), // rejet : r4/v1 libre, r4 pas couverte
  ];
  const etats = etatsDesCases(lignes, angles, essais, statutDe);

  it("calcule l'état de chaque case", () => {
    expect(etats.get(cleCase("r1", "v1"))).toEqual({ kind: "vente", sku: "SDN12" });
    expect(etats.get(cleCase("r2", "v2"))).toEqual({ kind: "validee", sku: "SDN15" });
    expect(etats.get(cleCase("r3", "v2"))).toEqual({ kind: "a_juger" });
    expect(etats.get(cleCase("r4", "v1"))).toEqual({ kind: "libre" });
    expect(etats.size).toBe(12);
  });

  it("une ligne est couverte par une image validée ou à juger pour le sac cible, pas par un rejet", () => {
    expect(ligneCouverte("r2", essais, "SDN15")).toBe(true);
    expect(ligneCouverte("r3", essais, "SDN15")).toBe(true);
    expect(ligneCouverte("r4", essais, "SDN15")).toBe(false);
    expect(ligneCouverte("r2", essais, "SDN16")).toBe(false);
  });

  it("choisit la première case libre de chaque ligne non couverte", () => {
    const choix = choixAutomatique(lignes, angles, etats, essais, "SDN15");
    expect(Object.fromEntries(choix)).toEqual({ r1: "v2", r2: null, r3: null, r4: "v1" });
  });

  it("rien à choisir quand toute la ligne est prise", () => {
    const pleine = [e("r1", "v1", null), e("r1", "v2", null), e("r1", "v3", null)].map((x) => ({ ...x, skuCible: "SDN9" }));
    const et = etatsDesCases([{ id: "r1" }], angles, pleine, statutDe);
    expect(choixAutomatique([{ id: "r1" }], angles, et, pleine, "SDN15").get("r1")).toBeNull();
  });
});

describe("sacsCibles", () => {
  it("garde les sacs sans annonce, le statut MyFlip l'emportant sur SacBase", () => {
    const sacs = [
      { sku: "SDN16", statut: "En stock", vendu: false },
      { sku: "SDN9", statut: "Vendu", vendu: true },
      { sku: "SDN12", statut: "En stock", vendu: false }, // SacBase en retard : MyFlip dit En vente
      { sku: "SDN15", statut: "?", vendu: false },
      { sku: "SDN20", statut: "Photos prêtes", vendu: false }, // inconnu de MyFlip : SacBase fait foi
    ];
    expect(sacsCibles(sacs, statutDe)).toEqual(["SDN15", "SDN16", "SDN20"]);
  });
});

describe("usageAngles", () => {
  it("compte les cases prises par colonne et les sacs validés, sans les rejets", () => {
    const u = usageAngles([
      { ...e("r1", "v1", "valide", "SDN12"), colorisId: "c1" },
      { ...e("r1", "v1", null), colorisId: "c1" }, // même case
      { ...e("r2", "v1", "valide", "SDN18"), colorisId: "c2" },
      { ...e("r3", "v2", "rejete"), colorisId: "c1" },
    ]);
    expect(u.get("v1")).toEqual({ cases: 2, skus: ["SDN12", "SDN18"] });
    expect(u.has("v2")).toBe(false);
  });
});

describe("passeFiltres", () => {
  const c = { generation: "V3", chezMoi: 2, prises: 0, aJuger: 1 };
  it("filtre par génération", () => {
    expect(passeFiltres(c, "V3", null)).toBe(true);
    expect(passeFiltres(c, "V1", null)).toBe(false);
  });
  it("doublons, à juger, à photographier", () => {
    expect(passeFiltres(c, null, "doublons")).toBe(true);
    expect(passeFiltres({ ...c, chezMoi: 1 }, null, "doublons")).toBe(false);
    expect(passeFiltres(c, null, "a_juger")).toBe(true);
    expect(passeFiltres({ ...c, aJuger: 0 }, null, "a_juger")).toBe(false);
    expect(passeFiltres(c, null, "a_photographier")).toBe(true);
    expect(passeFiltres({ ...c, prises: 14 }, null, "a_photographier")).toBe(false);
    expect(passeFiltres({ ...c, chezMoi: 0 }, null, "a_photographier")).toBe(false);
  });
});

describe("sansFreresDuLancement (comparaison de modèles)", () => {
  type EssaiLance = EssaiCase & { lancementId: string | null; modele: string };
  const l = (modele: string, lancementId: string | null, decision: string | null = null): EssaiLance => ({
    referenceId: "r1",
    angleId: "a1",
    decision,
    skuCible: "SDN15",
    lancementId,
    modele,
  });

  it("sets aside the essays of ANOTHER model of the same launch, so a late sibling request still sees a free case", () => {
    const essais = [l("a/x", "L1"), l("b/y", "L1")];
    expect(etatCase(essais, statutDe).kind).toBe("a_juger");
    const vus = sansFreresDuLancement(essais, "L1", "c/z");
    expect(vus).toEqual([]);
    expect(etatCase(vus, statutDe).kind).toBe("libre");
  });

  it("keeps the essays of the SAME model in the same launch: a double click is still refused", () => {
    const vus = sansFreresDuLancement([l("a/x", "L1")], "L1", "a/x");
    expect(vus).toHaveLength(1);
    expect(etatCase(vus, statutDe).kind).toBe("a_juger");
  });

  it("keeps the essays of another launch: the case really is taken", () => {
    const vus = sansFreresDuLancement([l("a/x", "L0", "valide")], "L1", "b/y");
    expect(etatCase(vus, statutDe).kind).toBe("validee");
  });

  it("never sets aside an essay without a launch (manual deposit)", () => {
    const vus = sansFreresDuLancement([l("manuel", null)], "L1", "b/y");
    expect(vus).toHaveLength(1);
  });

  it("does not mutate its input and keeps the order", () => {
    const essais = [l("a/x", "L0"), l("b/y", "L1"), l("c/z", "L0")];
    const copie = [...essais];
    expect(sansFreresDuLancement(essais, "L1", "a/x").map((x) => x.modele)).toEqual(["a/x", "c/z"]);
    expect(essais).toEqual(copie);
  });
});
