import { describe, expect, it } from "vitest";

import { cibleSelection, libelleSelection } from "./_selection";

const a = (id: string, statut = "En stock") => ({ id, statut });

describe("cibleSelection", () => {
  it("targets only the visible selected rows, in display order", () => {
    const r = cibleSelection(new Set(["c", "a", "x", "y"]), [a("a"), a("b"), a("c")]);
    expect(r).toEqual({ ids: ["a", "c"], masques: 2, vendus: 0 });
  });

  it("counts the sold rows among the targeted ones only", () => {
    const r = cibleSelection(new Set(["a", "b", "z"]), [a("a", "Vendu"), a("b"), a("c", "Vendu")]);
    expect(r).toEqual({ ids: ["a", "b"], masques: 1, vendus: 1 });
  });

  it("empty selection: nothing to send", () => {
    expect(cibleSelection(new Set(), [a("a")])).toEqual({ ids: [], masques: 0, vendus: 0 });
  });

  it("every selected row hidden: nothing to send, all counted", () => {
    expect(cibleSelection(new Set(["x", "y"]), [a("a")])).toEqual({ ids: [], masques: 2, vendus: 0 });
  });
});

describe("libelleSelection", () => {
  it("says how many are hidden by the filters", () => {
    expect(libelleSelection(3, 2)).toBe("3 sélectionnés, dont 2 masqués par les filtres");
    expect(libelleSelection(3, 1)).toBe("3 sélectionnés, dont 1 masqué par les filtres");
  });

  it("no tail when nothing is hidden; singular for one", () => {
    expect(libelleSelection(3, 0)).toBe("3 sélectionnés");
    expect(libelleSelection(1, 0)).toBe("1 sélectionné");
  });
});
