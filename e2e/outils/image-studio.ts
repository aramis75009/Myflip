/**
 * Image SYNTHÉTIQUE servie par le navigateur de test à la place de
 * GET /api/studio/image?ref=|essai= (Blob « niveau 0 » : le serveur e2e n'a
 * aucun jeton Blob). Un SVG dessiné ici : silhouette de sac et libellé de la
 * prise. Jamais une vraie photo, jamais une image générée par IA.
 * Déterministe : la même requête donne le même SVG.
 */

const PALETTE = ["#202124", "#c44870", "#decdb2", "#2c5282", "#803428", "#466e4a"];

function hacher(texte: string): number {
  let h = 2166136261;
  for (const c of texte) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

const echapper = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Clé stable d'une requête d'image : « ref:<id> » ou « essai:<id> ». */
export function cleImageStudio(url: URL): string {
  const ref = url.searchParams.get("ref");
  if (ref) return `ref:${ref}`;
  const essai = url.searchParams.get("essai");
  if (essai) return `essai:${essai}`;
  return `autre:${url.search}`;
}

/** Libellé par défaut quand le test n'en a pas fourni : « Photo ab12cd » / « Essai ab12cd ». */
export function libelleParDefaut(cle: string): string {
  const [genre, id = ""] = cle.split(":");
  const court = id.slice(-6);
  return genre === "essai" ? `Essai ${court}` : genre === "ref" ? `Photo ${court}` : "Image";
}

export function svgSac(cle: string, libelle: string): string {
  const h = hacher(cle);
  const sac = PALETTE[h % PALETTE.length];
  const fond = `hsl(${h % 360} 18% 90%)`;
  const generee = cle.startsWith("essai:");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">
<rect width="600" height="800" fill="${fond}"/>
<path d="M210 320 A90 90 0 0 1 390 320" fill="none" stroke="${sac}" stroke-width="22"/>
<path d="M130 320 H470 L510 700 H90 Z" fill="${sac}"/>
<rect x="282" y="320" width="36" height="46" rx="6" fill="#d4af37"/>
${generee ? '<text x="300" y="120" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="30" fill="#555">image de test (générée)</text>' : ""}
<rect x="40" y="726" width="520" height="52" rx="10" fill="rgba(255,255,255,0.82)"/>
<text x="300" y="762" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="30" fill="#111">${echapper(libelle)}</text>
</svg>`;
}
