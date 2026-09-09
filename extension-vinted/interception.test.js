import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

/**
 * `interception.js` est un content script CLASSIQUE : le manifest ne sait pas
 * charger un module ES à cet endroit, donc pas d'`export` à importer ici.
 *
 * Il est écrit pour ne RIEN exécuter à son chargement — que des déclarations —
 * ce qui le rend évaluable tel quel dans Node, sans DOM ni `browser`. C'est
 * cette propriété qui rend testable le cœur du rang 1 : ne pas la casser en y
 * ajoutant du code au niveau du fichier.
 */
const source = readFileSync(new URL("./interception.js", import.meta.url), "utf8");
const {
  normaliserPrix,
  analyserReponseBrouillon,
  verdictPrix,
  correspondReponse,
  attendreReponseVinted,
  interceptionPage,
} = new Function(
  `${source}\nreturn { normaliserPrix, analyserReponseBrouillon, verdictPrix, correspondReponse, attendreReponseVinted, interceptionPage };`,
)();

/**
 * Monte `interceptionPage()` sur un faux `window`, comme si elle venait
 * d'être injectée dans la page. Rend le `XMLHttpRequest` patché et la liste
 * des relais émis.
 *
 * Ce montage est possible parce que la fonction reçoit ses constantes en
 * ARGUMENTS au lieu de les écrire en dur : ne pas revenir là-dessus sans
 * mesurer ce que ça coûte ici.
 */
function monterInterception() {
  class FauxXHR {
    constructor() {
      this.status = 200;
      this.responseText = "";
      this.ecouteurs = [];
    }
    open() {}
    send() {}
    addEventListener(type, fn) {
      this.ecouteurs.push([type, fn]);
    }
    declencherLoad() {
      for (const [type, fn] of this.ecouteurs) if (type === "load") fn.call(this);
    }
  }
  FauxXHR.UNSENT = 0;
  FauxXHR.DONE = 4;

  const relais = [];
  const fenetre = { XMLHttpRequest: FauxXHR, fetch: undefined };
  const doc = { dispatchEvent: (e) => relais.push(e) };

  // `interceptionPage` tourne dans le monde de la PAGE : elle ne connaît que
  // les globales `window` et `document`, qu'on lui fabrique ici.
  //
  // ⚠️ Ces globales doivent rester en place pendant TOUT le test, pas
  // seulement pendant le montage : `relayer()` lit `document` au moment où
  // une réponse arrive, c'est-à-dire au `declencherLoad()` du test. Les
  // retirer trop tôt fait échouer le relais en silence — son `try/catch`
  // avale l'erreur, comme il le doit en production. D'où le nettoyage en
  // `afterEach` plutôt qu'en `finally`.
  const precedents = [globalThis.window, globalThis.document, globalThis.CustomEvent];
  globalThis.window = fenetre;
  globalThis.document = doc;
  globalThis.CustomEvent = class {
    constructor(type, init) {
      this.type = type;
      this.detail = init?.detail;
    }
  };
  demonter = () => {
    [globalThis.window, globalThis.document, globalThis.CustomEvent] = precedents;
  };

  interceptionPage(["/api/v2/item_upload/drafts"], "myflip:reponse-vinted");
  return { XHR: fenetre.XMLHttpRequest, OriginalXHR: FauxXHR, relais };
}

let demonter = null;
afterEach(() => {
  demonter?.();
  demonter = null;
});

describe("normaliserPrix", () => {
  it("lit la forme relevée le 08/09 chez Vinted", () => {
    expect(normaliserPrix({ amount: "0.0" })).toBe(0);
    expect(normaliserPrix({ amount: "24.5", currency_code: "EUR" })).toBe(24.5);
  });

  it("lit le prix français tel que le champ le reformate", () => {
    expect(normaliserPrix("15,00 €")).toBe(15);
    // L'espace insécable étroit que Vinted place avant le symbole.
    expect(normaliserPrix("24,50 €")).toBe(24.5);
  });

  it("lit un nombre nu et une chaîne à point décimal", () => {
    expect(normaliserPrix(12)).toBe(12);
    expect(normaliserPrix("12.30")).toBe(12.3);
  });

  it("répond null quand il n'y a rien à lire, jamais zéro", () => {
    // C'est LA distinction qui empêche d'arrêter la chaîne sur une réponse
    // dont on n'a pas compris la forme.
    expect(normaliserPrix(undefined)).toBeNull();
    expect(normaliserPrix(null)).toBeNull();
    expect(normaliserPrix("")).toBeNull();
    expect(normaliserPrix("gratuit")).toBeNull();
    expect(normaliserPrix({})).toBeNull();
    expect(normaliserPrix(Number.NaN)).toBeNull();
  });
});

describe("analyserReponseBrouillon", () => {
  it("lit le brouillon à 0,00 € du 08/09 — le cas qui justifie tout ce code", () => {
    const corps = JSON.stringify({
      item: { id: 987, title: "Sac à dos Nike", price: { amount: "0.0", currency_code: "EUR" } },
    });
    expect(analyserReponseBrouillon(corps)).toEqual({
      id: 987,
      prix: 0,
      titre: "Sac à dos Nike",
    });
  });

  it("accepte les trois emballages plausibles, la forme du POST n'ayant jamais été relevée", () => {
    const attendu = { id: 1, prix: 24.5, titre: "T" };
    const article = { id: 1, title: "T", price: { amount: "24.5" } };
    expect(analyserReponseBrouillon(JSON.stringify({ item: article }))).toEqual(attendu);
    expect(analyserReponseBrouillon(JSON.stringify({ draft: article }))).toEqual(attendu);
    expect(analyserReponseBrouillon(JSON.stringify(article))).toEqual(attendu);
  });

  it("renvoie null sur un corps illisible plutôt que de lever", () => {
    // Une page d'erreur HTML, un corps vide : le remplissage a peut-être
    // parfaitement réussi, il ne doit pas tomber là-dessus.
    expect(analyserReponseBrouillon("<html>503</html>")).toBeNull();
    expect(analyserReponseBrouillon("")).toBeNull();
    expect(analyserReponseBrouillon("null")).toBeNull();
    expect(analyserReponseBrouillon("[1,2]")).toBeNull();
  });

  it("rend prix null, et non zéro, quand la réponse ne porte pas de prix", () => {
    expect(analyserReponseBrouillon(JSON.stringify({ item: { id: 3 } })).prix).toBeNull();
  });
});

describe("verdictPrix", () => {
  it("attrape le cas historique : 15 demandé, 0,0 enregistré", () => {
    expect(verdictPrix("15", 0)).toBe("divergent");
  });

  it("accepte le prix français demandé face au nombre enregistré", () => {
    expect(verdictPrix("24,5", 24.5)).toBe("conforme");
  });

  it("tolère l'imprécision des flottants", () => {
    expect(verdictPrix("24,5", 24.499999999999996)).toBe("conforme");
  });

  it("dit « inconnu » plutôt que de conclure quand un des deux manque", () => {
    expect(verdictPrix("15", null)).toBe("inconnu");
    expect(verdictPrix("", 15)).toBe("inconnu");
  });

  it("ne confond pas un vrai zéro enregistré avec une absence de lecture", () => {
    expect(verdictPrix("0", 0)).toBe("conforme");
  });
});

describe("correspondReponse", () => {
  const paquet = { url: "https://www.vinted.fr/api/v2/item_upload/drafts", methode: "post" };

  it("apparie sur le fragment d'URL et la méthode, sans tenir compte de la casse", () => {
    expect(correspondReponse(paquet, "/api/v2/item_upload/drafts", "POST")).toBe(true);
  });

  it("ne confond pas le brouillon avec la publication réelle", () => {
    expect(correspondReponse(paquet, "/api/v2/item_upload/items", "POST")).toBe(false);
  });

  it("écarte une réponse antérieure au geste observé", () => {
    // Le cas qui compte : un enregistrement automatique de brouillon au
    // chargement du formulaire porterait la même URL et la même méthode que
    // celui du clic. Le servir reviendrait à vérifier le prix d'un brouillon
    // vide — et à croire la vérification faite.
    const ancienne = { ...paquet, ts: 1000 };
    expect(correspondReponse(ancienne, "/api/v2/item_upload/drafts", "POST", 5000)).toBe(false);
  });

  it("accepte une réponse postérieure au geste observé", () => {
    const recente = { ...paquet, ts: 9000 };
    expect(correspondReponse(recente, "/api/v2/item_upload/drafts", "POST", 5000)).toBe(true);
  });

  it("accepte un paquet sans horodatage plutôt que de perdre la vérification", () => {
    // Un script de page d'une version antérieure : mieux vaut vérifier avec un
    // doute que ne pas vérifier du tout.
    expect(correspondReponse(paquet, "/api/v2/item_upload/drafts", "POST", 5000)).toBe(true);
  });

  it("rejette la mauvaise méthode et le paquet vide", () => {
    expect(correspondReponse(paquet, "/api/v2/item_upload/drafts", "GET")).toBe(false);
    expect(correspondReponse(null, "/drafts", "POST")).toBe(false);
    expect(correspondReponse({}, "/drafts", "POST")).toBe(false);
  });
});

describe("attendreReponseVinted", () => {
  it("rend null au bout du délai — sans jamais rejeter", async () => {
    // Un rejet ici remonterait dans `remplir()`, qui le traduirait en
    // "echec-selecteurs" : la chaîne s'arrêterait sur un remplissage réussi
    // dont on n'a simplement pas intercepté la réponse.
    await expect(attendreReponseVinted("/jamais", "POST", 10)).resolves.toBeNull();
  });
});

describe("interceptionPage — le patch réellement monté", () => {
  it("relaie la réponse du brouillon, corps et statut compris", () => {
    const { XHR, relais } = monterInterception();
    const xhr = new XHR();
    xhr.open("POST", "https://www.vinted.fr/api/v2/item_upload/drafts");
    xhr.responseText = JSON.stringify({ item: { id: 42, price: { amount: "0.0" } } });
    xhr.declencherLoad();

    expect(relais).toHaveLength(1);
    const paquet = JSON.parse(relais[0].detail);
    expect(relais[0].type).toBe("myflip:reponse-vinted");
    expect(paquet.statut).toBe(200);
    expect(typeof paquet.ts).toBe("number");
    expect(analyserReponseBrouillon(paquet.corps).prix).toBe(0);
  });

  it("ignore ce qui n'est pas un POST sur une URL ciblée", () => {
    const { XHR, relais } = monterInterception();
    const lecture = new XHR();
    lecture.open("GET", "https://www.vinted.fr/api/v2/item_upload/drafts");
    lecture.declencherLoad();

    const autre = new XHR();
    autre.open("POST", "https://www.vinted.fr/api/v2/item_price_suggestions");
    autre.declencherLoad();

    expect(relais).toHaveLength(0);
  });

  it("préserve les constantes d'état du constructeur", () => {
    // Sans cette recopie, un `readyState === XMLHttpRequest.DONE` dans le code
    // de Vinted comparerait à `undefined` : c'est SA page qu'on casserait.
    const { XHR } = monterInterception();
    expect(XHR.DONE).toBe(4);
    expect(XHR.UNSENT).toBe(0);
  });

  it("partage le prototype d'origine, pour que `instanceof` tienne", () => {
    const { XHR, OriginalXHR } = monterInterception();
    expect(XHR.prototype).toBe(OriginalXHR.prototype);
  });

  it("ne se pose qu'une fois, même réinjectée", () => {
    // Deux couches de patch relaieraient chaque réponse en double.
    const { XHR, relais } = monterInterception();
    const xhr = new XHR();
    xhr.open("POST", "/api/v2/item_upload/drafts");
    xhr.responseText = "{}";
    xhr.declencherLoad();
    expect(relais).toHaveLength(1);
  });

  it("ne lève pas quand responseText est inaccessible", () => {
    // `responseText` jette si `responseType` n'est ni "" ni "text" — et cette
    // exception partirait dans le gestionnaire `load` de Vinted.
    const { XHR, relais } = monterInterception();
    const xhr = new XHR();
    xhr.open("POST", "/api/v2/item_upload/drafts");
    Object.defineProperty(xhr, "responseText", {
      get() {
        throw new Error("InvalidStateError");
      },
    });
    expect(() => xhr.declencherLoad()).not.toThrow();
    expect(JSON.parse(relais[0].detail).corps).toBe("");
  });
});
