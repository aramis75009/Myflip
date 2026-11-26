import { describe, expect, it } from "vitest";
import { FRAIS_EXPEDITION, margeBrute, margeNette } from "./calc";

describe("marge nette = marge brute − pochette", () => {
  it("n'enlève que 0,50 € par vente", () => {
    expect(FRAIS_EXPEDITION).toBe(0.5);
    expect(margeNette(75, 34.44)).toBeCloseTo(40.06, 2);
    expect(margeNette(75, 34.44)).toBeCloseTo(margeBrute(75, 34.44) - 0.5, 10);
  });
  it("ne dépend plus du prix de vente (plus de 6,38 %)", () => {
    expect(margeBrute(50, 25) - margeNette(50, 25)).toBeCloseTo(0.5, 10);
    expect(margeBrute(200, 25) - margeNette(200, 25)).toBeCloseTo(0.5, 10);
  });
});
