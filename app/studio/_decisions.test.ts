import { describe, expect, it } from "vitest";

import { DecisionsDifferees, type Decision, type Horloge } from "./_decisions";

/** A clock the test moves by hand. */
function fausseHorloge() {
  let n = 0;
  const minuteurs = new Map<number, { fn: () => void; a: number }>();
  let maintenant = 0;
  const horloge: Horloge = {
    poser: (fn, ms) => {
      n += 1;
      minuteurs.set(n, { fn, a: maintenant + ms });
      return n;
    },
    annuler: (jeton) => void minuteurs.delete(jeton as number),
  };
  const avancer = (ms: number) => {
    maintenant += ms;
    for (const [id, m] of [...minuteurs]) {
      if (m.a <= maintenant) {
        minuteurs.delete(id);
        m.fn();
      }
    }
  };
  return { horloge, avancer, actifs: () => minuteurs.size };
}

function monter(reponse: (id: string, d: Decision | null) => boolean = () => true) {
  const envois: { id: string; decision: Decision | null; urgent: boolean }[] = [];
  const evenements: string[] = [];
  const h = fausseHorloge();
  const file = new DecisionsDifferees(
    async (id, decision, { urgent }) => {
      envois.push({ id, decision, urgent });
      return reponse(id, decision) ? null : "Une autre image tient la case.";
    },
    h.horloge,
    {
      onChange: () => evenements.push("change"),
      onEnvoye: (id, d) => evenements.push(`envoye:${id}:${d}`),
      onErreur: (id, d, raison) => evenements.push(`erreur:${id}:${d}:${raison}`),
    },
    5_000,
  );
  return { file, envois, evenements, ...h };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("DecisionsDifferees", () => {
  it("nothing reaches the server before the delay, and the image is hidden at once", async () => {
    const { file, envois, avancer } = monter();
    file.decider("e1", "valide");
    expect([...file.masquees()]).toEqual(["e1"]);
    avancer(4_999);
    await tick();
    expect(envois).toEqual([]);
    avancer(1);
    await tick();
    expect(envois).toEqual([{ id: "e1", decision: "valide", urgent: false }]);
  });

  it("an undo within the delay sends NOTHING and brings the image back", async () => {
    const { file, envois, avancer, actifs } = monter();
    file.decider("e1", "rejete");
    expect(file.annuler("e1")).toBe("rien_envoye");
    expect(file.masquees().size).toBe(0);
    expect(actifs()).toBe(0);
    avancer(10_000);
    await tick();
    expect(envois).toEqual([]);
  });

  it("an undo after sending puts the decision back to null on the server", async () => {
    const { file, envois, avancer, evenements } = monter();
    file.decider("e1", "valide");
    avancer(5_000);
    await tick();
    expect(file.annuler("e1")).toBe("remise_a_juger");
    await tick();
    expect(envois.map((e) => e.decision)).toEqual(["valide", null]);
    expect(evenements).toContain("envoye:e1:null");
    expect(file.masquees().size).toBe(0);
  });

  it("a refused decision brings the image back and reports the error", async () => {
    const { file, avancer, evenements } = monter(() => false);
    file.decider("e1", "valide");
    avancer(5_000);
    await tick();
    expect(file.masquees().size).toBe(0);
    expect(evenements).toContain("erreur:e1:valide:Une autre image tient la case.");
  });

  it("vider() sends everything waiting at once, as urgent (keepalive)", async () => {
    const { file, envois, actifs } = monter();
    file.decider("e1", "valide");
    file.decider("e2", "rejete");
    file.vider();
    await tick();
    expect(actifs()).toBe(0);
    expect(envois).toEqual([
      { id: "e1", decision: "valide", urgent: true },
      { id: "e2", decision: "rejete", urgent: true },
    ]);
  });

  it("deciding twice on the same image keeps only the last decision", async () => {
    const { file, envois, avancer } = monter();
    file.decider("e1", "valide");
    file.decider("e1", "rejete");
    avancer(5_000);
    await tick();
    expect(envois).toEqual([{ id: "e1", decision: "rejete", urgent: false }]);
  });

  it("synchroniser() stops hiding a sent image once the server shows its decision", async () => {
    const { file, avancer } = monter();
    file.decider("e1", "valide");
    avancer(5_000);
    await tick();
    file.synchroniser(() => null);
    expect(file.masquees().has("e1")).toBe(true);
    file.synchroniser(() => "valide");
    expect(file.masquees().has("e1")).toBe(false);
  });

  it("an unknown image cannot be undone", () => {
    const { file } = monter();
    expect(file.annuler("absent")).toBe("inconnue");
  });
});
