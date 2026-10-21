/**
 * Photos SYNTHÉTIQUES pour les champs de fichier (Mise en vente) : un PNG
 * dessiné par le navigateur de test sur un canvas, silhouette de vêtement et
 * libellé. Jamais une vraie photo, jamais une image générée par IA.
 * Déterministe : le même numéro donne les mêmes pixels.
 */
import type { Page } from "@playwright/test";

export type FichierSynthetique = { name: string; mimeType: string; buffer: Buffer };

export async function photosSynthetiques(page: Page, nombre: number, prefixe = "photo-test"): Promise<FichierSynthetique[]> {
  const fichiers: FichierSynthetique[] = [];
  for (let n = 1; n <= nombre; n++) {
    const base64 = await page.evaluate((numero: number) => {
      const teintes = ["#2c5282", "#803428", "#466e4a", "#c44870", "#202124"];
      const canvas = document.createElement("canvas");
      canvas.width = 600;
      canvas.height = 800;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas 2d indisponible");
      ctx.fillStyle = `hsl(${(numero * 47) % 360} 15% 90%)`;
      ctx.fillRect(0, 0, 600, 800);
      // Silhouette de pull : corps, manches, col.
      ctx.fillStyle = teintes[numero % teintes.length];
      ctx.beginPath();
      ctx.moveTo(200, 160);
      ctx.lineTo(400, 160);
      ctx.lineTo(540, 300);
      ctx.lineTo(480, 360);
      ctx.lineTo(440, 320);
      ctx.lineTo(440, 680);
      ctx.lineTo(160, 680);
      ctx.lineTo(160, 320);
      ctx.lineTo(120, 360);
      ctx.lineTo(60, 300);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillRect(40, 720, 520, 56);
      ctx.fillStyle = "#111";
      ctx.font = "30px Helvetica, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`Photo de test ${numero}`, 300, 758);
      return canvas.toDataURL("image/png").split(",")[1];
    }, n);
    fichiers.push({ name: `${prefixe}-${n}.png`, mimeType: "image/png", buffer: Buffer.from(base64, "base64") });
  }
  return fichiers;
}
