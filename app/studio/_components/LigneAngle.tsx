"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Download, Pencil, Upload } from "lucide-react";
import { toast } from "sonner";
import { Module } from "@/components/console";
import { triggerDownload } from "@/lib/imageProcessing";
import { ROLES_REFERENCE, ROLE_LIBELLES, compilerPrompt } from "@/lib/studioAngles";
import { MODELE_MANUEL, modeleDe, referencesPourAngle } from "@/lib/studioFiche";
import { formatUsd, type Devis, type ModeleImage } from "@/lib/studioModeles";
import { Badge, btn, btnAcc, champ } from "../_ui";
import CarteEssai from "./CarteEssai";
import { ACCEPT, fichiersImages, lireErreur, preparer } from "./envoi";
import type { AngleClient, EssaiClient, RefClient } from "./FicheColoris";
import SelecteurModeles, { ConfirmationLancement, devisPour, montantDevis, type ContexteModeles } from "./SelecteurModeles";

export async function copier(texte: string, quoi = "Prompt") {
  try {
    await navigator.clipboard.writeText(texte);
    toast.success(`${quoi} copié.`);
  } catch {
    toast.error("Copie refusée par le navigateur.");
  }
}

// ── Génération par API ──────────────────────────────────────────────────────

/** Ce qu'on lance : des modèles, et pour une correction l'essai raté et les détails à corriger. */
type Lancement = { modeles: string[]; parent: { id: string; details: string[] } | null };
/** Un lancement qui attend la confirmation d'Aramis, avec le devis qui l'exige. */
type Attente = Lancement & { devis: Devis; serveur: boolean };

type EtatModele =
  | { kind: "en_cours" }
  | { kind: "fait"; coutReelUsd: number | null; coutEstimeUsd: number | null; tronquees: number }
  | { kind: "erreur"; code: string | null; message: string };
type Suivi = { modele: string; correction: boolean; etat: EtatModele };

/** Erreurs qui se règlent dans « Mon compte » (clé OpenRouter, crédit). */
const CODES_COMPTE = new Set(["missing_key", "bad_key", "no_credits"]);

const PEUT_ETRE_FACTUREE = "elle a peut-être été facturée, vérifie ton activité OpenRouter avant de relancer.";

type ReponseGeneration =
  | { kind: "ok"; essai: { id: string; coutEstimeUsd: number | null; coutReelUsd: number | null }; tronquees: number }
  | { kind: "confirmation"; devis: Devis | null }
  | { kind: "erreur"; code: string | null; message: string };

const nombreOuNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Le devis d'un 409, s'il a la bonne forme. */
function lireDevis(v: unknown): Devis | null {
  if (typeof v !== "object" || v === null) return null;
  const d = v as Partial<Devis>;
  if (!Array.isArray(d.lignes) || typeof d.totalConnuUsd !== "number" || typeof d.inconnus !== "number") return null;
  return { lignes: d.lignes, totalConnuUsd: d.totalConnuUsd, inconnus: d.inconnus, confirmationRequise: d.confirmationRequise !== false };
}

/** Une génération = une requête (écart 5 du plan). L'image ne revient jamais ici : elle est au Blob. */
async function envoyerGeneration(corps: Record<string, unknown>): Promise<ReponseGeneration> {
  let res: Response;
  try {
    res = await fetch("/api/studio/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corps),
    });
  } catch {
    return { kind: "erreur", code: null, message: `connexion perdue pendant la génération : ${PEUT_ETRE_FACTUREE}` };
  }
  const j = (await res.json().catch(() => null)) as {
    essai?: { id?: unknown; coutEstimeUsd?: unknown; coutReelUsd?: unknown };
    referencesTronquees?: unknown;
    error?: unknown;
    code?: unknown;
    devis?: unknown;
  } | null;
  if (res.ok && j?.essai && typeof j.essai.id === "string") {
    return {
      kind: "ok",
      essai: { id: j.essai.id, coutEstimeUsd: nombreOuNull(j.essai.coutEstimeUsd), coutReelUsd: nombreOuNull(j.essai.coutReelUsd) },
      tronquees: nombreOuNull(j.referencesTronquees) ?? 0,
    };
  }
  if (res.status === 409 && j?.code === "confirmation_requise") return { kind: "confirmation", devis: lireDevis(j.devis) };
  if (!j) {
    // Pas de JSON : une coupure de la plateforme (délai de la fonction dépassé…), pas une erreur de la route.
    const delai = res.status === 504 || res.status === 502;
    return { kind: "erreur", code: null, message: delai ? `délai dépassé (${res.status}) : ${PEUT_ETRE_FACTUREE}` : `réponse illisible (${res.status}).` };
  }
  return {
    kind: "erreur",
    code: typeof j.code === "string" ? j.code : null,
    message: typeof j.error === "string" && j.error ? j.error : `erreur ${res.status}.`,
  };
}

function texteFait(e: Extract<EtatModele, { kind: "fait" }>): string {
  const cout =
    e.coutReelUsd !== null
      ? formatUsd(e.coutReelUsd)
      : e.coutEstimeUsd !== null
        ? `estimé ${formatUsd(e.coutEstimeUsd)}`
        : "coût inconnu";
  const tronque = e.tronquees > 0 ? ` · ${e.tronquees} réf. non envoyée${e.tronquees > 1 ? "s" : ""} (maximum du modèle)` : "";
  return `fait · ${cout}${tronque}`;
}

// ── Essais groupés par modèle ───────────────────────────────────────────────

type Colonne = { modele: string; essais: EssaiClient[]; debut: number };

/** Une colonne par modèle, dans l'ordre où chaque modèle a produit son premier essai. */
function colonnesParModele(essais: EssaiClient[]): Colonne[] {
  const parModele = new Map<string, Colonne>();
  for (const e of essais) {
    const modele = modeleDe(e.modele);
    const c = parModele.get(modele) ?? { modele, essais: [], debut: Infinity };
    c.essais.push(e);
    c.debut = Math.min(c.debut, +new Date(e.createdAt));
    parModele.set(modele, c);
  }
  const colonnes = [...parModele.values()].sort((a, b) => a.debut - b.debut);
  for (const c of colonnes) c.essais.sort((a, b) => a.numero - b.numero);
  return colonnes;
}

/** Coût total d'une colonne : les coûts réels connus ; un coût manquant n'est jamais compté zéro. */
function totalColonne(c: Colonne): { texte: string; titre: string } {
  if (c.modele === MODELE_MANUEL) return { texte: "hors API", titre: "Images faites ailleurs : aucun coût OpenRouter." };
  let total = 0;
  let manquants = 0;
  for (const e of c.essais) {
    if (typeof e.coutReelUsd === "number") total += e.coutReelUsd;
    else manquants += 1;
  }
  if (manquants === c.essais.length) return { texte: "coût inconnu", titre: "OpenRouter n’a renvoyé aucun coût réel pour ces essais." };
  const texte = `${formatUsd(total)}${manquants > 0 ? ` + ${manquants} inconnu${manquants > 1 ? "s" : ""}` : ""}`;
  return { texte, titre: "Somme des coûts réels renvoyés par OpenRouter" };
}

export default function LigneAngle({
  cle,
  angle,
  details,
  references,
  essais,
  depotBloque,
  modeles,
}: {
  cle: string;
  angle: AngleClient;
  details: string;
  references: RefClient[];
  essais: EssaiClient[];
  depotBloque: boolean;
  modeles: ContexteModeles;
}) {
  const router = useRouter();
  const [edition, setEdition] = useState(false);
  const [brouillon, setBrouillon] = useState({ nom: angle.nom, angle: angle.angle, roleReference: angle.roleReference });
  const [survol, setSurvol] = useState(false);
  const [envoi, setEnvoi] = useState<string | null>(null);
  const [verifEnCours, setVerifEnCours] = useState<Set<string>>(new Set());
  const [coches, setCoches] = useState<string[]>([]);
  const [attente, setAttente] = useState<Attente | null>(null);
  const [suivis, setSuivis] = useState<Suivi[]>([]);

  const prompt = compilerPrompt({ angle: angle.angle, details });
  const aJoindre = referencesPourAngle(references, angle.roleReference);
  const roleLibelle = ROLE_LIBELLES[angle.roleReference as keyof typeof ROLE_LIBELLES] ?? angle.roleReference;

  const catalogue = modeles.catalogue;
  const parId = useMemo(() => new Map((catalogue?.modeles ?? []).map((m) => [m.id, m])), [catalogue]);
  const nomDe = (id: string) => (id === MODELE_MANUEL ? "Dépôt manuel" : parId.get(id)?.nom ?? id);
  const enCours = suivis.some((s) => s.etat.kind === "en_cours");
  const bloque =
    aJoindre.length === 0
      ? "Ajoute d’abord une vraie photo de référence."
      : depotBloque
        ? "Enregistre d’abord les détails à préserver."
        : null;
  const colonnes = useMemo(() => colonnesParModele(essais), [essais]);
  const numeros = useMemo(() => new Map(essais.map((e) => [e.id, e.numero])), [essais]);

  async function telechargerReferences() {
    for (let i = 0; i < aJoindre.length; i++) {
      const r = aJoindre[i];
      const res = await fetch(`/api/studio/image?ref=${r.id}`);
      if (!res.ok) {
        toast.error(`Référence ${i + 1} illisible.`);
        continue;
      }
      triggerDownload(await res.blob(), `${cle}-${r.role}-${i + 1}.jpg`);
    }
  }

  async function enregistrerAngle() {
    const res = await fetch(`/api/studio/angles/${angle.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(brouillon),
    });
    if (!res.ok) {
      toast.error(await lireErreur(res));
      return;
    }
    setEdition(false);
    router.refresh();
  }

  async function verifier(essaiId: string) {
    setVerifEnCours((s) => new Set(s).add(essaiId));
    try {
      const res = await fetch(`/api/studio/essais/${essaiId}/verifier`, { method: "POST" });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
        const versCompte = CODES_COMPTE.has(j?.code ?? "");
        toast.error(j?.error ?? `Vérification impossible (${res.status}).`, {
          duration: 10000,
          action: versCompte ? { label: "Mon compte", onClick: () => router.push("/compte") } : undefined,
        });
      }
    } finally {
      setVerifEnCours((s) => {
        const n = new Set(s);
        n.delete(essaiId);
        return n;
      });
      router.refresh();
    }
  }

  async function deposer(fichiers: File[]) {
    if (fichiers.length === 0 || envoi) return;
    if (depotBloque) {
      toast.error("Enregistre d’abord les détails à préserver : le prompt rangé avec l’essai en dépend.");
      return;
    }
    const nouveaux: string[] = [];
    for (let i = 0; i < fichiers.length; i++) {
      setEnvoi(`Dépôt ${i + 1}/${fichiers.length}…`);
      const p = await preparer(fichiers[i]);
      if (!p.ok) {
        toast.error(`${p.nom} : ${p.erreur}`, { duration: 10000 });
        continue;
      }
      const form = new FormData();
      form.set("cle", cle);
      form.set("angleId", angle.id);
      form.set("image", p.jpeg, "essai.jpg");
      const res = await fetch("/api/studio/essais", { method: "POST", body: form });
      if (!res.ok) {
        toast.error(`${p.nom} : ${await lireErreur(res)}`);
        continue;
      }
      nouveaux.push(((await res.json()) as { id: string }).id);
    }
    setEnvoi(null);
    router.refresh();
    // Vérification automatique (spec §3 étape 6), essai par essai.
    if (aJoindre.length > 0) for (const id of nouveaux) await verifier(id);
  }

  /** Les modèles du catalogue pour un lancement, ou null si l'un d'eux a disparu. */
  function modelesDe(l: Lancement): ModeleImage[] | null {
    const ms = l.modeles.map((id) => parId.get(id));
    return ms.every((m): m is ModeleImage => m !== undefined) ? ms : null;
  }

  /** Devis d'abord : sous le seuil et tous tarifs connus, on lance ; sinon on demande. */
  function demander(l: Lancement) {
    if (bloque || enCours || l.modeles.length === 0) return;
    const ms = modelesDe(l);
    if (!ms) {
      toast.error("Un modèle n’est plus au catalogue OpenRouter : recharge la page.");
      return;
    }
    const devis = devisPour(ms, aJoindre.length, l.parent !== null);
    if (devis.confirmationRequise) setAttente({ ...l, devis, serveur: false });
    else void lancer(l, false);
  }

  /**
   * Une requête par modèle, en parallèle, toutes avec la liste complète et le
   * même `lancementId` : le serveur recalcule le devis sur l'ensemble (écart 5).
   * Un modèle en échec n'arrête pas les autres.
   */
  async function lancer(l: Lancement, confirme: boolean) {
    setAttente(null);
    const lancementId = crypto.randomUUID();
    const correction = l.parent !== null;
    setSuivis(l.modeles.map((modele) => ({ modele, correction, etat: { kind: "en_cours" } })));
    const maj = (modele: string, etat: EtatModele | null) =>
      setSuivis((s) => (etat ? s.map((x) => (x.modele === modele ? { ...x, etat } : x)) : s.filter((x) => x.modele !== modele)));

    const aConfirmer: { modele: string; devis: Devis | null }[] = [];
    await Promise.all(
      l.modeles.map(async (modele) => {
        const r = await envoyerGeneration({
          cle,
          angleId: angle.id,
          modele,
          modeles: l.modeles,
          lancementId,
          confirme,
          ...(l.parent ? { essaiParentId: l.parent.id, detailsCorrection: l.parent.details } : {}),
        });
        if (r.kind === "confirmation") {
          aConfirmer.push({ modele, devis: r.devis });
          maj(modele, null);
        } else if (r.kind === "erreur") {
          maj(modele, { kind: "erreur", code: r.code, message: r.message });
        } else {
          maj(modele, { kind: "fait", coutReelUsd: r.essai.coutReelUsd, coutEstimeUsd: r.essai.coutEstimeUsd, tronquees: r.tronquees });
          // L'essai paraît tout de suite ; la vérification IA suit (écart 4), sans retenir le lancement.
          router.refresh();
          void verifier(r.essai.id);
        }
      }),
    );

    // Le serveur a recalculé un devis qui exige une confirmation : on rouvre l'encadré avec SON devis.
    if (aConfirmer.length > 0) {
      const ms = aConfirmer.map((a) => a.modele);
      const local = modelesDe({ modeles: ms, parent: l.parent });
      const devis = aConfirmer.find((a) => a.devis)?.devis ?? (local ? devisPour(local, aJoindre.length, correction) : null);
      if (devis) setAttente({ modeles: ms, parent: l.parent, devis, serveur: true });
      else toast.error("Le serveur demande une confirmation, mais son devis est illisible.");
    }
  }

  const confirmation = (pourCorrection: boolean) =>
    attente ? (
      <ConfirmationLancement
        devis={attente.devis}
        serveur={attente.serveur}
        correction={pourCorrection}
        nomDe={nomDe}
        onConfirmer={() => void lancer(attente, true)}
        onAnnuler={() => setAttente(null)}
      />
    ) : null;

  /** Ce qui permet (ou non) de régénérer un essai api avec son modèle. */
  function regeneration(e: EssaiClient) {
    const m = parId.get(e.modele);
    const raison = (() => {
      if (e.purge) return "Image purgée : plus rien à corriger.";
      if (!catalogue) return "Catalogue OpenRouter indisponible pour l’instant.";
      if (!m) return "Ce modèle n’est plus au catalogue OpenRouter.";
      // Même règle que le serveur : l'image ratée prend une place, il en faut une pour une vraie photo.
      if (m.maxReferences < 2) return `${m.nom} n’accepte qu’une image : impossible d’y joindre l’essai raté et une vraie photo.`;
      if (enCours) return "Une génération est en cours sur cet angle.";
      return bloque;
    })();
    return {
      raison,
      estimation: m ? montantDevis(devisPour([m], aJoindre.length, true)) : "inconnu",
      onRegenerer: (detailsCorrection: string[]) => demander({ modeles: [e.modele], parent: { id: e.id, details: detailsCorrection } }),
      confirmation: attente?.parent?.id === e.id ? confirmation(true) : null,
    };
  }

  return (
    <Module>
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="font-mono text-[11px] text-[var(--faint)]">#{angle.ordre}</span>
        <h2 className="text-[17px] font-bold tracking-[-0.01em]">{angle.nom}</h2>
        <Badge>RÉFÉRENCE : {roleLibelle.toUpperCase()}</Badge>
        <Badge>{essais.length} ESSAI{essais.length > 1 ? "S" : ""}</Badge>
        <button type="button" className={`${btn} ml-auto h-8`} onClick={() => setEdition((v) => !v)}>
          <Pencil size={13} /> {edition ? "Annuler" : "Modifier l’angle"}
        </button>
      </div>

      {edition && (
        <div className="mt-3 grid grid-cols-[1fr_180px] gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <input value={brouillon.nom} onChange={(e) => setBrouillon({ ...brouillon, nom: e.target.value })} className={champ} aria-label="Nom de l’angle" />
          <select
            value={brouillon.roleReference}
            onChange={(e) => setBrouillon({ ...brouillon, roleReference: e.target.value })}
            className={champ}
            aria-label="Photo de référence à joindre"
          >
            {ROLES_REFERENCE.map((r) => (
              <option key={r} value={r}>
                {ROLE_LIBELLES[r]}
              </option>
            ))}
          </select>
          <textarea
            value={brouillon.angle}
            onChange={(e) => setBrouillon({ ...brouillon, angle: e.target.value })}
            rows={3}
            className={`${champ} col-span-2 font-mono text-[12.5px]`}
            aria-label="Texte injecté dans {angle}"
          />
          <p className="text-[12px] text-[var(--ink2)]">
            Les essais déjà déposés gardent le prompt de leur dépôt.
          </p>
          <button type="button" className={`${btnAcc} justify-self-end`} onClick={() => void enregistrerAngle()}>
            Enregistrer l’angle
          </button>
        </div>
      )}

      <div className="mt-3 grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-[14px]">
        <div className="flex min-w-0 flex-col gap-2">
          <pre className="max-h-[220px] overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3 font-mono text-[12px] leading-[1.5] text-[var(--ink)]">
            {prompt}
          </pre>
          <div className="flex gap-2">
            <button type="button" className={btn} onClick={() => void copier(prompt)}>
              <Copy size={14} /> Copier le prompt
            </button>
            <button type="button" className={btn} onClick={() => void telechargerReferences()} disabled={aJoindre.length === 0}>
              <Download size={14} /> Télécharger les références ({aJoindre.length})
            </button>
          </div>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setSurvol(true);
          }}
          onDragLeave={() => setSurvol(false)}
          onDrop={(e) => {
            e.preventDefault();
            setSurvol(false);
            void deposer(fichiersImages(e.dataTransfer.files));
          }}
          className={`flex flex-col justify-between gap-2 rounded-2xl border-2 border-dashed p-3 transition-colors ${survol ? "border-[var(--acc)] bg-[var(--acc-soft)]" : "border-[var(--border)]"}`}
        >
          <div className="flex gap-2 overflow-x-auto">
            {aJoindre.length === 0 ? (
              <p className="text-[12.5px] font-semibold text-[var(--warn)]">Aucune référence à joindre : ajoute une vraie photo d’abord.</p>
            ) : (
              aJoindre.map((r) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={r.id}
                  src={`/api/studio/image?ref=${r.id}`}
                  alt="Référence à joindre"
                  className="h-[92px] w-[69px] flex-none rounded-lg border border-[var(--border)] object-cover"
                />
              ))
            )}
          </div>
          <label className={`${btn} cursor-pointer self-start`}>
            <Upload size={14} /> {envoi ?? "Déposer le résultat Gemini"}
            <input
              type="file"
              accept={ACCEPT}
              multiple
              hidden
              disabled={!!envoi}
              onChange={(e) => {
                void deposer(fichiersImages(e.target.files));
                e.target.value = "";
              }}
            />
          </label>
          <span className="text-[12px] text-[var(--ink2)]">ou glisse l’image ici — un dépôt = un essai.</span>
        </div>
      </div>

      <div className="mt-[14px]">
        <SelecteurModeles
          contexte={modeles}
          nbReferences={aJoindre.length}
          coches={coches}
          onCoches={setCoches}
          bloque={bloque}
          enCours={enCours}
          onGenerer={() => demander({ modeles: coches.filter((id) => parId.has(id)), parent: null })}
          confirmation={attente && !attente.parent ? confirmation(false) : null}
        />
        {suivis.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1 px-1 text-[12.5px]" aria-live="polite">
            {suivis.map((s) => (
              <li key={s.modele} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-semibold text-[var(--ink)]">{nomDe(s.modele)}</span>
                {s.correction && <span className="font-mono text-[10px] tracking-[0.06em] text-[var(--faint)]">CORRECTION</span>}
                {s.etat.kind === "en_cours" && <span className="text-[var(--ink2)]">en cours…</span>}
                {s.etat.kind === "fait" && <span className="font-mono text-[12px] text-[var(--pos)]">{texteFait(s.etat)}</span>}
                {s.etat.kind === "erreur" && (
                  <>
                    <span className="min-w-0 text-[var(--neg)]">erreur : {s.etat.message}</span>
                    {CODES_COMPTE.has(s.etat.code ?? "") && (
                      <Link href="/compte" className="font-semibold text-[var(--ink)] underline underline-offset-2">
                        Mon compte
                      </Link>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {colonnes.length > 0 && (
        // Une colonne par modèle ; trois tiennent dans la largeur, au-delà on défile.
        <div className="mt-[14px] flex gap-3 overflow-x-auto pb-1">
          {colonnes.map((c) => {
            const total = totalColonne(c);
            return (
              <section key={c.modele} aria-label={`Essais : ${nomDe(c.modele)}`} className="flex w-[calc((100%-24px)/3)] min-w-[300px] flex-none flex-col gap-3">
                <header className="flex items-baseline justify-between gap-2 border-b border-[var(--border)] pb-1.5">
                  <span className="min-w-0 truncate text-[13.5px] font-bold" title={c.modele}>
                    {nomDe(c.modele)}
                  </span>
                  <span className="flex-none font-mono text-[11px] text-[var(--ink2)]" title={total.titre}>
                    {c.essais.length} ESSAI{c.essais.length > 1 ? "S" : ""} · {total.texte}
                  </span>
                </header>
                {c.essais.map((e) => (
                  <CarteEssai
                    key={e.id}
                    essai={e}
                    reference={aJoindre[0] ?? null}
                    details={details}
                    nomModele={nomDe(modeleDe(e.modele))}
                    correctionDe={e.essaiParentId ? numeros.get(e.essaiParentId) ?? null : null}
                    verifEnCours={verifEnCours.has(e.id)}
                    onVerifier={() => void verifier(e.id)}
                    regeneration={e.source === "api" ? regeneration(e) : null}
                  />
                ))}
              </section>
            );
          })}
        </div>
      )}
    </Module>
  );
}
