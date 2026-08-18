// extension-vinted/pairing.test.js
import { describe, expect, it } from "vitest";
import { pairEvents } from "./pairing.js";

describe("pairEvents", () => {
  it("apparie un événement à un message dans l'ordre d'arrivée, même openerTabId", () => {
    const events = [{ tabId: 100, openerTabId: 1, ts: 10 }];
    const messages = [{ entryId: "a", openerTabId: 1, ts: 5 }];
    const { pairs, unmatchedEvents, unmatchedMessages } = pairEvents(events, messages);
    expect(pairs).toEqual([{ tabId: 100, entryId: "a" }]);
    expect(unmatchedEvents).toHaveLength(0);
    expect(unmatchedMessages).toHaveLength(0);
  });

  it("apparie deux mises en file rapprochées dans l'ordre d'arrivée respectif", () => {
    const events = [
      { tabId: 100, openerTabId: 1, ts: 10 },
      { tabId: 101, openerTabId: 1, ts: 20 },
    ];
    const messages = [
      { entryId: "premier", openerTabId: 1, ts: 5 },
      { entryId: "second", openerTabId: 1, ts: 15 },
    ];
    const { pairs } = pairEvents(events, messages);
    expect(pairs).toEqual([
      { tabId: 100, entryId: "premier" },
      { tabId: 101, entryId: "second" },
    ]);
  });

  it("ne mélange pas les paires de deux onglets MyFlip différents (openerTabId distinct)", () => {
    const events = [
      { tabId: 100, openerTabId: 1, ts: 10 },
      { tabId: 200, openerTabId: 2, ts: 11 },
    ];
    const messages = [
      { entryId: "depuis-onglet-1", openerTabId: 1, ts: 5 },
      { entryId: "depuis-onglet-2", openerTabId: 2, ts: 6 },
    ];
    const { pairs } = pairEvents(events, messages);
    expect(pairs).toContainEqual({ tabId: 100, entryId: "depuis-onglet-1" });
    expect(pairs).toContainEqual({ tabId: 200, entryId: "depuis-onglet-2" });
  });

  it("un événement orphelin (PATCH échoué mais onglet quand même créé) ne décale pas les paires suivantes", () => {
    const events = [
      { tabId: 100, openerTabId: 1, ts: 10 }, // orphelin, aucun message correspondant
      { tabId: 101, openerTabId: 1, ts: 20 },
    ];
    const messages = [{ entryId: "second", openerTabId: 1, ts: 15 }];
    const { pairs, unmatchedEvents } = pairEvents(events, messages, {
      orphanTimeoutMs: 1000,
      now: 20,
    });
    // L'événement à ts:10 expire (now - ts > orphanTimeoutMs n'est pas encore
    // vrai ici à dessein — ce test vérifie surtout qu'il n'est PAS apparié
    // au message "second" juste parce qu'il est arrivé avant dans la liste
    // brute des événements) :
    expect(pairs.find((p) => p.entryId === "second")?.tabId).toBe(101);
  });

  it("un message sans événement correspondant reste non apparié, pas d'erreur", () => {
    const events = [];
    const messages = [{ entryId: "orphelin", openerTabId: 1, ts: 5 }];
    const { pairs, unmatchedMessages } = pairEvents(events, messages);
    expect(pairs).toHaveLength(0);
    expect(unmatchedMessages).toEqual([messages[0]]);
  });
});
