"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Copy, Download, Lock, Sparkles, Star, Upload } from "lucide-react";
import { toast } from "sonner";
import { Module } from "@/components/console";
import { triggerDownload } from "@/lib/imageProcessing";
import { PRISES, choixAutomatique, cleCase, nomPrise, type EtatCase } from "@/lib/studioCases";
import { libelleTarif, type ModeleImage } from "@/lib/studioModeles";
import { btn, btnAcc } from "../_ui";
import { ACCEPT, fichiersImages, lireErreur, preparer } from "./envoi";
import { CODES_COMPTE, copier, envoyerGeneration, parNom, parPaquets } from "./lancer";
import { SEUIL_TEXTE, devisPour, montantDevis, type ContexteModeles } from "./SelecteurModeles";
import type { FicheClient } from "./Fiche";

/** Générations en vol en même temps : assez pour aller vite, peu pour ne pas saturer la clé. */
const EN_PARALLELE = 3;

type Choix = { referenceId: string; angleId: string; ordre: number };
type Mode = "api" | "manuel";
type Progression = { total: number; faits: number; erreurs: string[] };

const pl = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;

/**
 * « Choisir les angles » : une ligne par vraie photo, une colonne par prompt
 * d'angle. Une case déjà mise en vente, validée ou à juger ne se choisit plus ;
 * le choix automatique prend la première case libre de chaque photo. Puis on
 * génère par API, ou à la main dans Gemini.
 */
export default function TableauCases({
  fiche,
  cible,
  modeles,
  onNouveaux,
}: {
  fiche: FicheClient;
  cible: string | null;
  modeles: ContexteModeles;
  /** Essais créés : la fiche lance leur avis IA. */
  onNouveaux: (ids: string[]) => void;
}) {
  const router = useRouter();
  const { lignes, angles, cases } = fiche;
  const etats = useMemo(() => new Map(Object.entries(cases)) as Map<string, EtatCase>, [cases]);
  const auto = useMemo(
    () => choixAutomatique(lignes, angles, etats, fiche.essais, cible),
    [lignes, angles, etats, fiche.essais, cible],
  );
  // null = choix automatique ; sinon les choix d'Aramis, ligne par ligne.
  const [manuels, setManuels] = useState<Record<string, string | null> | null>(null);
  const choixDe = (refId: string) => (manuels && refId in manuels ? manuels[refId] : auto.get(refId) ?? null);
  const choisies: Choix[] = lignes.flatMap((l) => {
    const a = choixDe(l.id);
    return a && etats.get(cleCase(l.id, a))?.kind === "libre" ? [{ referenceId: l.id, angleId: a, ordre: l.ordre }] : [];
  });

  function basculer(refId: string, angleId: string) {
    setManuels((m) => ({ ...(m ?? {}), [refId]: choixDe(refId) === angleId ? null : angleId }));
  }

  // ── Comptes pour le sac cible ───────────────────────────────────────────
  const pourCible = fiche.essais.filter((e) => cible && e.skuCible === cible && e.decision !== "rejete");
  const pretes = new Set(pourCible.filter((e) => e.decision === "valide").map((e) => e.referenceId)).size;
  const aJuger = new Set(pourCible.filter((e) => e.decision === null).map((e) => e.referenceId)).size;
  const restantes = lignes.length - new Set(pourCible.map((e) => e.referenceId)).size;

  // ── Usage des colonnes sur ce coloris ───────────────────────────────────
  const usage = (angleId: string) => {
    const etatsColonne = lignes.map((l) => etats.get(cleCase(l.id, angleId)));
    const vente = etatsColonne.flatMap((e) => (e?.kind === "vente" ? [e.sku] : []));
    const prises = etatsColonne.filter((e) => e && e.kind !== "libre").length;
    if (vente.length > 0) return `${vente.length} en vente · ${[...new Set(vente)].join(", ")}`;
    if (prises > 0) return `${prises} case${prises > 1 ? "s" : ""} prise${prises > 1 ? "s" : ""}`;
    return "jamais utilisée";
  };

  // ── Lancement ───────────────────────────────────────────────────────────
  const [mode, setMode] = useState<Mode>("api");
  const [modeleId, setModeleId] = useState<string | null>(null);
  const [attente, setAttente] = useState(false);
  const [progression, setProgression] = useState<Progression | null>(null);
  const depot = useRef<HTMLInputElement>(null);

  const catalogue = modeles.catalogue?.modeles ?? [];
  const parId = new Map(catalogue.map((m) => [m.id, m]));
  const favoris = modeles.favoris.map((id) => parId.get(id)).filter((m): m is ModeleImage => !!m);
  const proposes = favoris.length > 0 ? favoris : catalogue.slice(0, 3);
  const modele = (modeleId && parId.get(modeleId)) || proposes[0] || null;
  const devis = modele && choisies.length > 0 ? devisPour(Array.from({ length: choisies.length }, () => modele), 1) : null;
  const enCours = progression !== null && progression.faits < progression.total;
  const bloque = !cible
    ? "Aucun sac de ce coloris sans annonce : rien à préparer."
    : choisies.length === 0
      ? "Choisis au moins une case."
      : null;

  async function generer(confirme: boolean) {
    if (!modele || !cible || enCours || choisies.length === 0) return;
    if (devis?.confirmationRequise && !confirme) {
      setAttente(true);
      return;
    }
    setAttente(false);
    const lancementId = crypto.randomUUID();
    const lot = [...choisies];
    const prog: Progression = { total: lot.length, faits: 0, erreurs: [] };
    setProgression({ ...prog });
    const nouveaux: string[] = [];
    let compte = false;
    await parPaquets(
      lot.map((c) => async () => {
        const r = await envoyerGeneration({
          cle: fiche.coloris.cle,
          angleId: c.angleId,
          referenceId: c.referenceId,
          skuCible: cible,
          nbCases: lot.length,
          modele: modele.id,
          modeles: [modele.id],
          lancementId,
          confirme: true,
        });
        prog.faits++;
        if (r.kind === "ok") nouveaux.push(r.essaiId);
        else {
          const message = r.kind === "erreur" ? r.message : "confirmation refusée par le serveur";
          prog.erreurs.push(`Photo ${String(c.ordre).padStart(2, "0")} : ${message}`);
          if (r.kind === "erreur" && CODES_COMPTE.has(r.code ?? "")) compte = true;
        }
        setProgression({ ...prog, erreurs: [...prog.erreurs] });
      }),
      EN_PARALLELE,
    );
    setManuels(null);
    router.refresh();
    if (prog.erreurs.length > 0) {
      toast.error(`${pl(prog.erreurs.length, "génération")} en échec.`, {
        duration: 12000,
        action: compte ? { label: "Mon compte", onClick: () => router.push("/compte") } : undefined,
      });
    }
    if (nouveaux.length > 0) {
      toast.success(`${pl(nouveaux.length, "image")} générée${nouveaux.length > 1 ? "s" : ""} : elles rejoignent la file à juger.`);
      onNouveaux(nouveaux);
    }
  }

  // ── À la main, dans Gemini ──────────────────────────────────────────────
  const nomFichier = (c: Choix) => `${String(c.ordre).padStart(2, "0")}-${fiche.coloris.cle}.jpg`;

  async function telechargerPhotos() {
    for (const c of choisies) {
      const res = await fetch(`/api/studio/image?ref=${c.referenceId}`);
      if (!res.ok) {
        toast.error(`Photo ${c.ordre} illisible.`);
        continue;
      }
      triggerDownload(await res.blob(), nomFichier(c));
    }
  }

  const promptsNumerotes = () =>
    choisies.map((c) => `${String(c.ordre).padStart(2, "0")} — ${angles.find((a) => a.id === c.angleId)?.angle ?? ""}`).join("\n");

  async function deposer(liste: File[]) {
    const fichiers = fichiersImages(liste).sort(parNom);
    if (fichiers.length === 0 || enCours || !cible) return;
    if (fichiers.length !== choisies.length) {
      toast.error(`${pl(fichiers.length, "image")} pour ${pl(choisies.length, "case choisie")} : il en faut autant, dans le même ordre.`);
      return;
    }
    const lot = [...choisies];
    const prog: Progression = { total: lot.length, faits: 0, erreurs: [] };
    setProgression({ ...prog });
    const nouveaux: string[] = [];
    for (let i = 0; i < lot.length; i++) {
      const c = lot[i];
      try {
        const p = await preparer(fichiers[i]);
        if (!p.ok) throw new Error(p.erreur);
        const form = new FormData();
        form.set("cle", fiche.coloris.cle);
        form.set("referenceId", c.referenceId);
        form.set("angleId", c.angleId);
        form.set("skuCible", cible);
        form.set("image", p.jpeg, nomFichier(c));
        const res = await fetch("/api/studio/essais", { method: "POST", body: form });
        if (!res.ok) throw new Error(await lireErreur(res));
        nouveaux.push(((await res.json()) as { id: string }).id);
      } catch (e) {
        prog.erreurs.push(`${fichiers[i].name} : ${e instanceof Error ? e.message : "erreur inconnue"}`);
      }
      prog.faits++;
      setProgression({ ...prog, erreurs: [...prog.erreurs] });
    }
    setManuels(null);
    router.refresh();
    if (prog.erreurs.length > 0) toast.error(`${pl(prog.erreurs.length, "dépôt")} en échec.`, { duration: 12000 });
    if (nouveaux.length > 0) onNouveaux(nouveaux);
  }

  async function changerPrise(refId: string, ordre: number) {
    const res = await fetch(`/api/studio/references/${refId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ordre }),
    });
    if (!res.ok) toast.error(await lireErreur(res));
    router.refresh();
  }

  const grille = { gridTemplateColumns: `220px repeat(${Math.max(angles.length, 1)}, minmax(112px, 1fr))` };

  return (
    <Module className="p-[22px]">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-[20px] font-bold tracking-[-0.01em]">Choisir les angles</h2>
          <p className="mt-0.5 text-[14px] text-[var(--ink2)]">
            Une ligne par vraie photo, une colonne par prompt d’angle. Une case déjà mise en vente ou déjà générée pour ce coloris ne se choisit plus.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[14px]">
          <span className="text-[var(--ink2)]">Photos pour</span>
          <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--acc)] bg-[var(--acc-soft)] px-3.5">
            <span className="font-mono font-bold">{cible ?? "—"}</span>
            {cible && <span className="text-[var(--ink2)]">· prochaine annonce</span>}
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-[var(--ink2)]">
        <Legende cls="bg-[var(--surface-2)] border-[var(--border-strong)]" texte="Déjà en vente (verrouillé)" />
        <Legende cls="bg-[var(--pos-soft)] border-[var(--pos)]" texte={cible ? `Validée pour ${cible}` : "Validée"} />
        <Legende cls="bg-[var(--warn-soft)] border-[var(--warn)]" texte="Générée, à juger" />
        <Legende cls="bg-surface border-[var(--border-strong)]" texte="Libre, clique pour choisir" />
      </div>

      {lignes.length === 0 ? (
        <div className="mt-4 rounded-[18px] border border-dashed border-[var(--border-strong)] p-6 text-center text-[14px] text-[var(--ink2)]">
          Le tableau apparaît dès que les vraies photos sont importées.
        </div>
      ) : angles.length === 0 ? (
        <div className="mt-4 rounded-[18px] border border-dashed border-[var(--border-strong)] p-6 text-center text-[14px] text-[var(--ink2)]">
          Aucun prompt d’angle.{" "}
          <a href="/parametres?onglet=studio" className="font-semibold text-[var(--ink)] underline underline-offset-2">
            Ajoute-les dans Prompts, onglet Studio
          </a>
          .
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <div className="min-w-max" role="table" aria-label="Photos × prompts d’angle">
            <div className="grid items-end gap-1.5 border-b border-[var(--border)] pb-2" style={grille} role="row">
              <span className="font-mono text-[11px] tracking-[0.14em] text-[var(--ink2)]" role="columnheader">
                VRAIE PHOTO
              </span>
              {angles.map((a) => (
                <div key={a.id} title={a.angle} role="columnheader" className="px-1">
                  <div className="truncate text-[13.5px] font-semibold">{a.nom}</div>
                  <div className="truncate text-[11.5px] text-[var(--ink2)]">{usage(a.id)}</div>
                </div>
              ))}
            </div>
            {lignes.map((l) => (
              <div key={l.id} className="grid items-center gap-1.5 border-b border-[var(--border)] py-1.5" style={grille} role="row">
                <div className="flex min-w-0 items-center gap-2.5" role="rowheader">
                  <div className="h-[52px] w-[39px] flex-none overflow-hidden rounded-lg border border-[var(--border)]">
                    {/* eslint-disable-next-line @next/next/no-img-element -- image privée servie par /api/studio/image */}
                    <img src={`/api/studio/image?ref=${l.id}`} alt="" loading="lazy" className="h-full w-full object-cover" />
                  </div>
                  <span className="font-mono text-[12px] text-[var(--ink2)]">{String(l.ordre).padStart(2, "0")}</span>
                  <select
                    value={l.ordre}
                    onChange={(e) => void changerPrise(l.id, Number(e.target.value))}
                    aria-label={`Prise de la photo ${l.ordre}`}
                    title="Changer de prise (échange avec la photo qui l’occupe)"
                    className="min-w-0 flex-1 truncate rounded-lg border border-transparent bg-transparent py-1 text-[13.5px] font-medium text-[var(--ink)] hover:border-[var(--border)] focus:border-[var(--acc)] focus:outline-none"
                  >
                    {PRISES.map((nom, i) => (
                      <option key={nom} value={i + 1}>
                        {nom}
                      </option>
                    ))}
                    {l.ordre > PRISES.length && <option value={l.ordre}>{nomPrise(l.ordre)}</option>}
                  </select>
                </div>
                {angles.map((a) => (
                  <Case
                    key={a.id}
                    etat={etats.get(cleCase(l.id, a.id))}
                    cible={cible}
                    choisie={choixDe(l.id) === a.id}
                    onChoisir={() => basculer(l.id, a.id)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {lignes.length > 0 && angles.length > 0 && (
        <div className="mt-4 rounded-[20px] bg-[var(--surface-2)] p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold">
                {cible ? `${cible} : ${pl(pretes, "photo")} prête${pretes > 1 ? "s" : ""}, ${aJuger} à juger, ${choisies.length} à générer` : `${choisies.length} à générer`}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[var(--ink2)]">
                <span>
                  {choisies.length >= restantes
                    ? "Une variante choisie pour chaque photo restante."
                    : `${pl(restantes - choisies.length, "photo")} sans variante choisie.`}
                </span>
                <button type="button" className="font-semibold text-[var(--ink)] underline underline-offset-2" onClick={() => setManuels(null)}>
                  Choisir automatiquement
                </button>
                <button
                  type="button"
                  className="font-semibold text-[var(--ink)] underline underline-offset-2"
                  onClick={() => setManuels(Object.fromEntries(lignes.map((l) => [l.id, null])))}
                >
                  Tout décocher
                </button>
              </div>
            </div>
            <div className="inline-flex gap-0.5 rounded-[14px] bg-[var(--raise)] p-1" role="tablist" aria-label="Façon de générer">
              {(
                [
                  ["api", "Par API"],
                  ["manuel", "À la main, dans Gemini"],
                ] as const
              ).map(([m, nom]) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => setMode(m)}
                  className={`h-9 rounded-[11px] px-3.5 text-[13.5px] font-semibold transition-colors ${
                    mode === m ? "bg-surface text-[var(--ink)] shadow-sm" : "text-[var(--ink2)] hover:text-[var(--ink)]"
                  }`}
                >
                  {nom}
                </button>
              ))}
            </div>
          </div>

          {mode === "api" ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="font-mono text-[11px] tracking-[0.14em] text-[var(--ink2)]">MODÈLE</span>
              <div className="flex flex-wrap gap-1.5">
                {modeles.chargement && !modeles.catalogue ? (
                  <span className="text-[13px] text-[var(--ink2)]">Chargement du catalogue…</span>
                ) : modeles.erreur && !modeles.catalogue ? (
                  <button type="button" className={btn} onClick={modeles.recharger}>
                    Catalogue indisponible ({modeles.erreur}) — réessayer
                  </button>
                ) : (
                  proposes.map((m) => {
                    const actif = modele?.id === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        aria-pressed={actif}
                        onClick={() => setModeleId(m.id)}
                        className={`inline-flex h-10 items-center gap-2 rounded-full border px-3.5 text-[13.5px] font-semibold transition-colors ${
                          actif ? "border-[var(--acc)] bg-[var(--acc-soft)] text-[var(--ink)]" : "border-[var(--border)] bg-surface text-[var(--ink2)] hover:text-[var(--ink)]"
                        }`}
                      >
                        {favoris.includes(m) && <Star size={12} className="fill-current text-[var(--warn)]" aria-label="favori" />}
                        {m.nom}
                        <span className="font-mono text-[11.5px] font-medium opacity-75">{libelleTarif(m.tarif)}</span>
                      </button>
                    );
                  })
                )}
                {catalogue.length > proposes.length && (
                  <select
                    value=""
                    onChange={(e) => e.target.value && setModeleId(e.target.value)}
                    aria-label="Autre modèle"
                    className="h-10 rounded-full border border-[var(--border)] bg-surface px-3 text-[13px] text-[var(--ink2)]"
                  >
                    <option value="">Autre modèle…</option>
                    {catalogue
                      .filter((m) => !proposes.includes(m))
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nom} — {libelleTarif(m.tarif)}
                        </option>
                      ))}
                  </select>
                )}
              </div>
              <div className="ml-auto text-right">
                <div className="flex items-baseline justify-end gap-2">
                  <span className="text-[13px] text-[var(--ink2)]">Devis</span>
                  <span className="font-mono text-[15px] font-bold">{devis ? montantDevis(devis) : "—"}</span>
                </div>
                <div className="text-[12px] text-[var(--ink2)]">
                  {!devis
                    ? "Choisis au moins une case."
                    : devis.confirmationRequise
                      ? `Au-delà de ${SEUIL_TEXTE} ou au jeton : confirmation demandée.`
                      : `Sous ${SEUIL_TEXTE} : part sans confirmation.`}
                </div>
              </div>
              <button
                type="button"
                className={`${btnAcc} h-11 rounded-full px-5 text-[14px]`}
                disabled={!!bloque || !modele || enCours}
                title={bloque ?? undefined}
                onClick={() => void generer(false)}
              >
                <Sparkles size={15} />
                {enCours ? `Génération ${progression!.faits} / ${progression!.total}…` : choisies.length ? `Générer ${pl(choisies.length, "image")}` : "Générer"}
              </button>
              {attente && devis && modele && (
                <div role="alertdialog" aria-label="Confirmer la dépense" className="w-full rounded-xl border border-[var(--warn)] bg-[var(--warn-soft)] p-3 text-[13.5px]">
                  <p className="font-semibold">
                    {pl(choisies.length, "image")} avec {modele.nom} :{" "}
                    {devis.inconnus > 0 && devis.totalConnuUsd === 0 ? "coût inconnu (tarif au jeton)" : `estimé à ${montantDevis(devis)}`}. Confirmer ?
                  </p>
                  <p className="mt-1 text-[12.5px] text-[var(--ink2)]">
                    Confirmation demandée au-delà de {SEUIL_TEXTE} ou dès qu’un tarif est inconnu. Ta clé OpenRouter paie.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" className={btnAcc} onClick={() => void generer(true)}>
                      <Sparkles size={14} /> Confirmer et générer
                    </button>
                    {/* eslint-disable-next-line jsx-a11y/no-autofocus -- Entrée ne doit jamais dépenser par réflexe */}
                    <button type="button" className={btn} autoFocus onClick={() => setAttente(false)}>
                      Annuler
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <ol className="mt-4 grid gap-3 [grid-template-columns:repeat(3,minmax(0,1fr))]">
              <Etape n={1} titre="Nouvelle conversation Gemini">
                <span>
                  Modèle <strong>Pro</strong>, format <strong>3:4</strong>. Colle le prompt maître une seule fois ; Gemini répond OK.
                </span>
                <button type="button" className={btn} disabled={!fiche.promptMaitre} onClick={() => void copier(fiche.promptMaitre, "Prompt maître")}>
                  <Copy size={14} /> {fiche.promptMaitre ? "Copier le prompt maître" : "Prompt maître vide"}
                </button>
              </Etape>
              <Etape n={2} titre={`Envoie les ${choisies.length} photos choisies`}>
                <span>Pour chacune : la photo, puis son prompt d’angle. Les fichiers sont numérotés dans le même ordre que les prompts.</span>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={btn} disabled={choisies.length === 0} onClick={() => void telechargerPhotos()}>
                    <Download size={14} /> Photos
                  </button>
                  <button type="button" className={btn} disabled={choisies.length === 0} onClick={() => void copier(promptsNumerotes(), "Prompts d’angle")}>
                    <Copy size={14} /> Prompts d’angle
                  </button>
                </div>
              </Etape>
              <Etape n={3} titre="Dépose les résultats">
                <span>Dans le même ordre : chaque image retrouve sa case et part au jugement.</span>
                <button type="button" className={btnAcc} disabled={!!bloque || enCours} title={bloque ?? undefined} onClick={() => depot.current?.click()}>
                  <Upload size={14} /> {enCours ? `Dépôt ${progression!.faits} / ${progression!.total}…` : "Déposer"}
                </button>
                <input
                  ref={depot}
                  type="file"
                  accept={ACCEPT}
                  multiple
                  hidden
                  onChange={(e) => {
                    void deposer(Array.from(e.target.files ?? []));
                    e.target.value = "";
                  }}
                />
              </Etape>
            </ol>
          )}

          {progression && progression.erreurs.length > 0 && !enCours && (
            <ul className="mt-3 flex flex-col gap-0.5 rounded-xl border border-[var(--neg)] bg-[var(--neg-soft)] p-3 text-[12.5px] text-[var(--ink)]">
              {progression.erreurs.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Module>
  );
}

function Legende({ cls, texte }: { cls: string; texte: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-3 w-3 rounded-[4px] border ${cls}`} aria-hidden="true" />
      {texte}
    </span>
  );
}

function Etape({ n, titre, children }: { n: number; titre: string; children: ReactNode }) {
  return (
    <li className="flex flex-col gap-2 rounded-[16px] bg-surface p-3.5 text-[13px] text-[var(--ink2)]">
      <div className="flex items-center gap-2 text-[14px] font-semibold text-[var(--ink)]">
        <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[var(--surface-2)] text-[12.5px] font-bold">{n}</span>
        {titre}
      </div>
      {children}
    </li>
  );
}

function Case({ etat, cible, choisie, onChoisir }: { etat: EtatCase | undefined; cible: string | null; choisie: boolean; onChoisir: () => void }) {
  const base = "flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border text-[12.5px] font-semibold";
  if (!etat || etat.kind === "libre") {
    return (
      <div role="cell">
        <button
          type="button"
          aria-pressed={choisie}
          onClick={onChoisir}
          className={`${base} transition-colors ${
            choisie
              ? "border-[var(--acc)] bg-[var(--acc-soft)] font-bold text-[var(--ink)]"
              : "border-[var(--border)] bg-surface font-medium text-[var(--ink2)] hover:border-[var(--border-strong)]"
          }`}
        >
          <span
            className={`h-3.5 w-3.5 rounded-full border-2 ${choisie ? "border-[var(--acc)] bg-[var(--acc)]" : "border-[var(--border-strong)] bg-surface"}`}
            aria-hidden="true"
          />
          {choisie ? "Choisie" : "Libre"}
        </button>
      </div>
    );
  }
  if (etat.kind === "vente") {
    return (
      <div role="cell" title={`Utilisée dans l’annonce de ${etat.sku}`} className={`${base} border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--ink2)]`}>
        <Lock size={12} aria-hidden="true" />
        <span className="font-mono">{etat.sku}</span>
      </div>
    );
  }
  if (etat.kind === "validee") {
    return (
      <div role="cell" className={`${base} border-[var(--pos)] bg-[var(--pos-soft)] text-[var(--pos)]`}>
        Validée{etat.sku && etat.sku !== cible ? ` · ${etat.sku}` : ""}
      </div>
    );
  }
  return (
    <div role="cell" className={`${base} border-[var(--warn)] bg-[var(--warn-soft)] text-[var(--ink)]`}>
      <span className="h-[7px] w-[7px] rounded-full bg-[var(--warn)]" aria-hidden="true" />À juger
    </div>
  );
}

