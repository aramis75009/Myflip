import { describe, expect, it } from "vitest";
import {
  ANGLES_AMORCAGE,
  BLOC_COMMUN_PAR_DEFAUT,
  DETAILS_PAR_DEFAUT,
  ROLES_REFERENCE,
  ROLE_LIBELLES,
  SCENE_PAR_DEFAUT,
  compilerCorrection,
  compilerPrompt,
  detailsEnLignes,
  substituer,
} from "./studioAngles";

describe("substituer", () => {
  it("replaces a known variable", () => {
    expect(substituer("Angle: {angle}", { angle: "front view" })).toBe("Angle: front view");
  });

  it("replaces every occurrence of a repeated variable", () => {
    expect(substituer("{a} et {a} puis {b}", { a: "X", b: "Y" })).toBe("X et X puis Y");
  });

  it("leaves an unknown variable untouched", () => {
    expect(substituer("{angle} {inconnue}", { angle: "A" })).toBe("A {inconnue}");
  });

  it("leaves a variable missing from the provided values untouched", () => {
    expect(substituer("{angle} / {scene}", { angle: "A" })).toBe("A / {scene}");
  });

  it("does not treat inherited object keys as variables", () => {
    expect(substituer("{constructor} {toString}", {})).toBe("{constructor} {toString}");
  });

  it("keeps literal braces that are not a variable name", () => {
    expect(substituer('{ "a": 1 } {} { angle } {1x}', { angle: "A" })).toBe('{ "a": 1 } {} { angle } {1x}');
  });

  it("replaces a variable with an empty string value", () => {
    expect(substituer("avant [{scene}] après", { scene: "" })).toBe("avant [] après");
  });

  it("does not re-expand a variable written inside a value", () => {
    expect(substituer("{angle} | {scene}", { angle: "voir {scene}", scene: "fond" })).toBe("voir {scene} | fond");
  });

  it("does not interpret $ patterns in values", () => {
    expect(substituer("{a}", { a: "$& $1 $$" })).toBe("$& $1 $$");
  });
});

describe("detailsEnLignes", () => {
  it("splits one detail per line and drops blank lines", () => {
    expect(detailsEnLignes("patch ELITE\n\n  \nswoosh blanc cassé\n")).toEqual(["patch ELITE", "swoosh blanc cassé"]);
  });

  it("handles Windows line endings and trims each line", () => {
    expect(detailsEnLignes("  a  \r\nb\r\n")).toEqual(["a", "b"]);
  });

  it("strips list bullets", () => {
    expect(detailsEnLignes("- a\n• b\n* c\n-d")).toEqual(["a", "b", "c", "-d"]);
  });

  it("removes duplicates ignoring case, keeping the first spelling", () => {
    expect(detailsEnLignes("Patch ELITE\npatch elite\nswoosh")).toEqual(["Patch ELITE", "swoosh"]);
  });

  it("accepts an array and returns an empty list for empty input", () => {
    expect(detailsEnLignes([" a ", "", "b"])).toEqual(["a", "b"]);
    expect(detailsEnLignes("")).toEqual([]);
    expect(detailsEnLignes(" \n \n")).toEqual([]);
  });
});

describe("compilerPrompt", () => {
  const base = { angle: "back view", details: "patch ELITE côté gauche\nswoosh blanc cassé" };

  it("fills angle, details and scene in the default block", () => {
    const p = compilerPrompt({ ...base, scene: "wooden table" });
    expect(p).toContain("Angle: back view");
    expect(p).toContain("- patch ELITE côté gauche\n- swoosh blanc cassé");
    expect(p).toContain("Scene: wooden table");
    expect(p).not.toMatch(/\{(angle|details|scene)\}/);
  });

  it("falls back to the default scene when none or a blank one is given", () => {
    expect(compilerPrompt(base)).toContain(`Scene: ${SCENE_PAR_DEFAUT}`);
    expect(compilerPrompt({ ...base, scene: "   " })).toContain(`Scene: ${SCENE_PAR_DEFAUT}`);
  });

  it("falls back to a neutral sentence when there is no detail", () => {
    expect(compilerPrompt({ ...base, details: "\n \n" })).toContain(DETAILS_PAR_DEFAUT);
  });

  it("uses a custom block and fills a variable used several times", () => {
    const p = compilerPrompt({ bloc: "{angle} / {details} / {angle} / {x}", angle: "A", details: "d1" });
    expect(p).toBe("A / - d1 / A / {x}");
  });

  it("accepts details already split into lines", () => {
    expect(compilerPrompt({ bloc: "{details}", angle: "A", details: ["a", "b"] })).toBe("- a\n- b");
  });

  it("keeps literal braces in the block", () => {
    expect(compilerPrompt({ bloc: '{angle} {"k": 1}', angle: "A", details: "" })).toBe('A {"k": 1}');
  });

  it("uses every variable of the default block", () => {
    for (const v of ["{angle}", "{details}", "{scene}"]) expect(BLOC_COMMUN_PAR_DEFAUT).toContain(v);
  });
});

describe("compilerCorrection", () => {
  it("starts with the targeted-fix sentence and lists the drifting details", () => {
    const p = compilerCorrection(["patch ELITE", "swoosh"]);
    expect(p).toMatch(/^Keep everything identical, but fix these details/);
    expect(p).toContain("- patch ELITE\n- swoosh");
  });

  it("uses the singular for one detail", () => {
    expect(compilerCorrection("patch ELITE")).toMatch(/^Keep everything identical, but fix this detail so that it matches/);
  });

  it("returns null when there is nothing to fix", () => {
    expect(compilerCorrection([])).toBeNull();
    expect(compilerCorrection(" \n ")).toBeNull();
  });
});

describe("ANGLES_AMORCAGE", () => {
  it("contains the seven angles of the spec, in order", () => {
    expect(ANGLES_AMORCAGE.map((a) => a.nom)).toEqual(["Face", "Dos", "Bretelles", "Boucle", "Profil", "Patch", "Sac ouvert"]);
    expect(ANGLES_AMORCAGE.map((a) => a.ordre)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("only uses known reference roles, and covers each of them", () => {
    for (const a of ANGLES_AMORCAGE) expect(ROLES_REFERENCE).toContain(a.roleReference);
    expect(new Set(ANGLES_AMORCAGE.map((a) => a.roleReference))).toEqual(new Set(ROLES_REFERENCE));
  });

  it("has a non-empty English angle text without template variables", () => {
    for (const a of ANGLES_AMORCAGE) {
      expect(a.angle.length).toBeGreaterThan(20);
      expect(a.angle).not.toMatch(/\{\w+\}/);
    }
  });

  it("compiles every seed angle into a prompt with no leftover variable", () => {
    for (const a of ANGLES_AMORCAGE) {
      expect(compilerPrompt({ angle: a.angle, details: "patch ELITE" })).not.toMatch(/\{\w+\}/);
    }
  });

  it("has a French label for every role", () => {
    for (const r of ROLES_REFERENCE) expect(ROLE_LIBELLES[r]).toBeTruthy();
  });
});
