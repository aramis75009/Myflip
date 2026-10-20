// Les deux contacts entre la mise en vente et le Studio, et eux seuls :
//   1. les vraies photos d'un sac Hipobuy partent vers POST /api/studio/references ;
//   2. les images que le Studio a générées ET qu'Aramis a VALIDÉES pour ce sac
//      reviennent par GET /api/studio/annonce (règle du 20/10).
// Aucun import de `lib/studio*` ici (le test lib/studioCloisonnement.test.ts le
// vérifie) : on parle à des routes, pas à des modules.
//
// Best-effort, toujours : cette fonction ne lève jamais et ne bloque rien. Une
// panne du Blob ou de SacBase ne doit pas plus gêner une mise en vente qu'une
// panne Trello ne gêne une validation comptable. Le serveur, de son côté,
// refuse tout ce qui n'est pas un sac Hipobuy du compte avant d'envoyer au Blob.

import { compressImage } from "@/lib/imageProcessing";

/** Taille visée par la spec (§8) : JPEG ~1600 px, sous les 4,5 Mo d'une requête Vercel. */
const COTE_MAX = 1600;
const QUALITE = 0.85;
const OCTETS_PAR_ENVOI = 3_500_000;
const PHOTOS_PAR_ENVOI = 12;

/** Le sac vient-il d'une commande Hipobuy ? Filtre côté client, le serveur revérifie. */
export const estSacHipobuy = (fournisseur: string | null | undefined) =>
  !!fournisseur && /hipobuy/i.test(fournisseur);

async function empreinte(fichier: Blob): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", await fichier.arrayBuffer());
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Envoie les photos d'une série. `position` = rang de la 1re photo dans la
 * fiche (le serveur en déduit le rôle suggéré : face, dos, côté…).
 * `originaux` sert à l'empreinte (dédoublonnage), `jpegs` à l'envoi.
 */
export async function conserverReferences(
  sku: string,
  position: number,
  photos: { original: Blob; jpeg: Blob }[],
): Promise<void> {
  try {
    const prets: { blob: Blob; empreinte: string; position: number }[] = [];
    for (let i = 0; i < photos.length; i++) {
      try {
        prets.push({
          blob: await compressImage(photos[i].jpeg, COTE_MAX, QUALITE),
          empreinte: await empreinte(photos[i].original),
          position: position + i,
        });
      } catch {
        /* une photo qui ne se compresse pas est simplement non conservée */
      }
    }

    // Par lots : un envoi par paquet de photos, pas une requête par photo.
    let lot: typeof prets = [];
    let octets = 0;
    const envoyer = async () => {
      if (lot.length === 0) return;
      const form = new FormData();
      form.set("origine", "mise_en_vente");
      form.set("sku", sku);
      form.set("position", String(lot[0].position));
      for (const p of lot) {
        form.append("photo", p.blob, `${p.empreinte}.jpg`);
        form.append("empreinte", p.empreinte);
      }
      lot = [];
      octets = 0;
      const res = await fetch("/api/studio/references", { method: "POST", body: form });
      // Un sac non Hipobuy rend 200 { ignore: true } : rien à faire de plus.
      if (!res.ok) console.warn("[mise-en-vente] références Studio non conservées :", res.status);
    };
    for (const p of prets) {
      if (lot.length >= PHOTOS_PAR_ENVOI || (lot.length > 0 && octets + p.blob.size > OCTETS_PAR_ENVOI)) await envoyer();
      lot.push(p);
      octets += p.blob.size;
    }
    await envoyer();
  } catch (e) {
    console.warn("[mise-en-vente] références Studio non conservées :", e instanceof Error ? e.name : e);
  }
}

/**
 * Les images du Studio VALIDÉES par Aramis pour ce sac (règle du 20/10 : une
 * image générée et validée part dans l'annonce du sac choisi), en fichiers
 * prêts pour le pipeline photo, dans l'ordre des prises.
 *
 * Le second et dernier contact avec le Studio, toujours par une route : seule
 * la décision d'Aramis compte, le serveur ne rend que `decision = "valide"`.
 * Best-effort comme le reste : une panne rend [], jamais une erreur. Ces
 * fichiers ne doivent JAMAIS repartir vers `conserverReferences` : une image
 * générée n'est pas une vraie photo.
 */
export async function imagesValideesStudio(sku: string): Promise<{ essaiId: string; fichier: File }[]> {
  try {
    const res = await fetch(`/api/studio/annonce?sku=${encodeURIComponent(sku)}`, { cache: "no-store" });
    if (!res.ok) return [];
    const j = (await res.json()) as { images?: { essaiId?: unknown; ordre?: unknown }[] };
    const images = (j.images ?? []).filter((i): i is { essaiId: string; ordre: number } => typeof i.essaiId === "string" && typeof i.ordre === "number");
    const out: { essaiId: string; fichier: File }[] = [];
    for (const i of images) {
      const img = await fetch(`/api/studio/image?essai=${encodeURIComponent(i.essaiId)}`);
      if (!img.ok) continue;
      const blob = await img.blob();
      const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
      out.push({ essaiId: i.essaiId, fichier: new File([blob], `studio-${String(i.ordre).padStart(2, "0")}.${ext}`, { type: blob.type || "image/jpeg" }) });
    }
    return out;
  } catch (e) {
    console.warn("[mise-en-vente] images Studio non chargées :", e instanceof Error ? e.name : e);
    return [];
  }
}
