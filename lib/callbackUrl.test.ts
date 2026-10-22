import { describe, expect, it } from "vitest";

import { callbackUrlSur } from "./callbackUrl";

const ORIGINE = "https://myflip-app.vercel.app";

describe("callbackUrlSur", () => {
  it("garde un chemin relatif de même origine, avec sa requête", () => {
    expect(callbackUrlSur("/stock?x=1", ORIGINE)).toBe("/stock?x=1");
  });

  it("refuse un autre site", () => {
    expect(callbackUrlSur("https://autre-site/x", ORIGINE)).toBe("/dashboard");
  });

  it("refuse une URL sans schéma (//autre-site)", () => {
    expect(callbackUrlSur("//autre-site", ORIGINE)).toBe("/dashboard");
  });

  it("refuse les barres obliques inverses et les schémas exotiques", () => {
    expect(callbackUrlSur("/\\autre-site", ORIGINE)).toBe("/dashboard");
    expect(callbackUrlSur("javascript:alert(1)", ORIGINE)).toBe("/dashboard");
  });

  it("revient au tableau de bord sans valeur", () => {
    expect(callbackUrlSur(null, ORIGINE)).toBe("/dashboard");
    expect(callbackUrlSur(undefined, ORIGINE)).toBe("/dashboard");
    expect(callbackUrlSur("", ORIGINE)).toBe("/dashboard");
  });

  it("ramène une URL absolue de même origine à son chemin", () => {
    expect(callbackUrlSur(`${ORIGINE}/stock`, ORIGINE)).toBe("/stock");
  });
});
