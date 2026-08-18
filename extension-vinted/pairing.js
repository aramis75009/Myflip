// extension-vinted/pairing.js
//
// Apparie chaque événement tabs.onCreated à son message de mise en file,
// PAR openerTabId, par ordre CAUSAL — un message n'est éligible pour un
// événement que si son ts est strictement antérieur à celui de l'événement,
// parce que la séquence réelle est toujours : succès du PATCH → message de
// mise en file envoyé → window.open() → tabs.onCreated. Jamais "le premier
// onglet qui charge consomme la tête d'une file générique" (bug trouvé en
// revue Design : ça mélange les articles quand plusieurs onglets sont
// ouverts dans le désordre) — et jamais un simple appariement par RANG au
// sein du même openerTabId non plus (un rang ignore l'ordre causal réel et
// peut apparier un événement à un message qui n'existait pas encore quand
// l'onglet a été créé).
//
// Un événement sans message éligible (le plus ancien message non consommé
// a un ts >= au sien, ou il n'en reste aucun) reste dans unmatchedEvents :
// il NE consomme PAS le message suivant. C'est ce qui rend le mécanisme
// robuste à un événement orphelin (PATCH échoué mais onglet quand même créé
// avant la correction Eng, ou tout autre cas non prévu) sans avoir besoin
// d'un mécanisme d'expiration par timeout séparé.

export function pairEvents(tabCreatedEvents, queueMessages) {
  const pairs = [];
  const usedMessageIndexes = new Set();
  const usedEventIndexes = new Set();

  const byOpener = new Map();
  for (let i = 0; i < queueMessages.length; i++) {
    const m = queueMessages[i];
    if (!byOpener.has(m.openerTabId)) byOpener.set(m.openerTabId, []);
    byOpener.get(m.openerTabId).push(i);
  }
  for (const indexes of byOpener.values()) {
    indexes.sort((a, b) => queueMessages[a].ts - queueMessages[b].ts);
  }

  const eventsByOpener = new Map();
  for (let i = 0; i < tabCreatedEvents.length; i++) {
    const e = tabCreatedEvents[i];
    if (!eventsByOpener.has(e.openerTabId)) eventsByOpener.set(e.openerTabId, []);
    eventsByOpener.get(e.openerTabId).push(i);
  }
  for (const indexes of eventsByOpener.values()) {
    indexes.sort((a, b) => tabCreatedEvents[a].ts - tabCreatedEvents[b].ts);
  }

  for (const [openerTabId, eventIndexes] of eventsByOpener) {
    const messageIndexes = byOpener.get(openerTabId) ?? [];
    let msgPtr = 0;
    for (const ei of eventIndexes) {
      const eventTs = tabCreatedEvents[ei].ts;
      if (msgPtr < messageIndexes.length && queueMessages[messageIndexes[msgPtr]].ts < eventTs) {
        const mi = messageIndexes[msgPtr];
        pairs.push({
          tabId: tabCreatedEvents[ei].tabId,
          entryId: queueMessages[mi].entryId,
        });
        usedEventIndexes.add(ei);
        usedMessageIndexes.add(mi);
        msgPtr++;
      }
      // Sinon : aucun message éligible pour cet événement (le plus ancien
      // message restant n'était pas encore là quand l'onglet a été créé) —
      // l'événement reste orphelin, msgPtr n'avance pas.
    }
  }

  const unmatchedEvents = tabCreatedEvents.filter((_, i) => !usedEventIndexes.has(i));
  const unmatchedMessages = queueMessages.filter((_, i) => !usedMessageIndexes.has(i));

  return { pairs, unmatchedEvents, unmatchedMessages };
}
