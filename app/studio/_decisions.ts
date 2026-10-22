// Decisions on generated images, deferred: V or R hides the image at once,
// but NOTHING reaches the server before the undo delay is over. « Annuler »
// within the delay sends nothing at all; after it, the decision is put back to
// null (PATCH { decision: null }, accepted by the existing route).
//
// PURE: the sender and the clock are injected, so app/studio/_decisions.test.ts
// checks every path without a browser or a network.

export type Decision = "valide" | "rejete";

/**
 * Sends one decision; `urgent` = the page is closing (fetch keepalive).
 * Resolves to null when recorded, or to the reason of the refusal.
 */
export type EnvoiDecision = (essaiId: string, decision: Decision | null, options: { urgent: boolean }) => Promise<string | null>;

export type Horloge = {
  poser: (fn: () => void, ms: number) => unknown;
  annuler: (jeton: unknown) => void;
};

export type EvenementsDecisions = {
  /** The local queue changed: an image left it or came back. */
  onChange: () => void;
  /** The server recorded the decision (null = an undo after sending). */
  onEnvoye: (essaiId: string, decision: Decision | null) => void;
  /** The server did not record it (`raison`): the image is back in the queue. */
  onErreur: (essaiId: string, decision: Decision | null, raison: string) => void;
};

export type ResultatAnnulation = "rien_envoye" | "remise_a_juger" | "inconnue";

export const DELAI_ANNULATION_MS = 5_000;

export class DecisionsDifferees {
  private readonly attente = new Map<string, { decision: Decision; jeton: unknown }>();
  /** Sent (or being sent), hidden until the server's own data says so. */
  private readonly envoyees = new Map<string, Decision>();

  constructor(
    private readonly envoyer: EnvoiDecision,
    private readonly horloge: Horloge,
    private readonly ev: EvenementsDecisions,
    private readonly delaiMs: number = DELAI_ANNULATION_MS,
  ) {}

  /** Records the decision locally; it leaves for the server after the delay. */
  decider(essaiId: string, decision: Decision): void {
    const deja = this.attente.get(essaiId);
    if (deja) this.horloge.annuler(deja.jeton);
    const jeton = this.horloge.poser(() => void this.envoyerUne(essaiId), this.delaiMs);
    this.attente.set(essaiId, { decision, jeton });
    this.ev.onChange();
  }

  /**
   * « Annuler » of the toast. Still waiting: nothing is sent, ever. Already
   * sent (the toast outlived the delay, e.g. hovered): the decision goes back
   * to null on the server.
   */
  annuler(essaiId: string): ResultatAnnulation {
    const a = this.attente.get(essaiId);
    if (a) {
      this.horloge.annuler(a.jeton);
      this.attente.delete(essaiId);
      this.ev.onChange();
      return "rien_envoye";
    }
    if (this.envoyees.has(essaiId)) {
      this.envoyees.delete(essaiId);
      this.ev.onChange();
      void this.envoyer(essaiId, null, { urgent: false }).then(
        (refus) => (refus === null ? this.ev.onEnvoye(essaiId, null) : this.ev.onErreur(essaiId, null, refus)),
        () => this.ev.onErreur(essaiId, null, "connexion perdue"),
      );
      return "remise_a_juger";
    }
    return "inconnue";
  }

  /** Everything still waiting leaves now: the page closes or the screen changes. */
  vider(): void {
    for (const [id, a] of [...this.attente]) {
      this.horloge.annuler(a.jeton);
      void this.envoyerUne(id, true);
    }
  }

  /** Images to keep out of the queue: waiting, or sent and not yet re-read. */
  masquees(): ReadonlySet<string> {
    return new Set([...this.attente.keys(), ...this.envoyees.keys()]);
  }

  /** The decision waiting for `essaiId`, if any (before or during sending). */
  decisionDe(essaiId: string): Decision | null {
    return this.attente.get(essaiId)?.decision ?? this.envoyees.get(essaiId) ?? null;
  }

  enAttente(): number {
    return this.attente.size;
  }

  /**
   * The server data arrived: a sent decision it now shows needs no hiding any
   * more. `decisionServeur(id)` is undefined for an unknown image.
   */
  synchroniser(decisionServeur: (essaiId: string) => string | null | undefined): void {
    let change = false;
    for (const [id, d] of [...this.envoyees]) {
      const s = decisionServeur(id);
      if (s === d || s === undefined) {
        this.envoyees.delete(id);
        change = true;
      }
    }
    if (change) this.ev.onChange();
  }

  private async envoyerUne(essaiId: string, urgent = false): Promise<void> {
    const a = this.attente.get(essaiId);
    if (!a) return;
    this.attente.delete(essaiId);
    this.envoyees.set(essaiId, a.decision);
    let refus: string | null;
    try {
      refus = await this.envoyer(essaiId, a.decision, { urgent });
    } catch {
      refus = "connexion perdue";
    }
    if (refus === null) {
      this.ev.onEnvoye(essaiId, a.decision);
      return;
    }
    // Only if no undo happened meanwhile (the undo already removed it).
    if (this.envoyees.get(essaiId) === a.decision) this.envoyees.delete(essaiId);
    this.ev.onChange();
    this.ev.onErreur(essaiId, a.decision, refus);
  }
}
