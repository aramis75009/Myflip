"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Copy, Lock, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import { toastErreur, toastSucces } from "@/lib/toast";
import { corpsGarder, type Proposition } from "@/lib/studioReformulation";
import {
  lireModificationVersion,
  longueurTitre,
  nomVersion,
  normaliserTitre,
  texteDescription,
  TITRE_MAX,
  type ChampTexte,
  type VersionAffichee,
  type VersionEnBase,
} from "@/lib/studioVersion";

import { lireErreur } from "./envoi";
import { PropositionReformulation } from "./PropositionReformulation";
import { copier, patchVersion, type Enfiler } from "./versionApi";

const LIBELLE = "text-xs font-bold uppercase tracking-[0.05em] text-ink-3";
const LIBELLES: Record<ChampTexte, string> = { titre: "Titre", description: "Tirets", motsCles: "Mots-clés" };

type Valeurs = Record<ChampTexte, string>;
type Etat = "envoi" | "enregistre";

/**
 * « Texte de l’annonce » d'une version : son titre, sa description (les
 * tirets) et ses mots-clés, avec la ligne SKU.
 *
 * Version 1 : l'annonce ACTUELLE du sac, lue dans l'Article. Lecture seule, et
 * pas de « Reformuler » (« elle n’est pas reformulée »).
 *
 * Version 2 et suivantes :
 *   • titre, tirets et mots-clés se modifient À LA MAIN, et s'enregistrent
 *     comme le SKU : Entrée (titre, mots-clés) ou en quittant le champ ; un
 *     bouton « Enregistrer » reste visible pour les tirets, qui ont plusieurs
 *     lignes (sans rien à enregistrer, il ne part rien). Chaque enregistrement
 *     n'envoie que SON champ ;
 *   • « Reformuler » part toujours du titre et des mots-clés ENREGISTRÉS (donc
 *     de ce qu'Aramis vient de corriger : ce qui est tapé s'enregistre
 *     d'abord). L'IA propose, rien n'est écrit tant qu'Aramis ne clique pas
 *     « Garder » ; fermer l'encadré ne fait rien. Aucun appel IA sans clic.
 *     L'IA ne touche JAMAIS aux tirets ni au SKU : seul Aramis modifie les tirets,
 *     à la main ;
 *   • « Copier la description » copie la description telle qu'elle est à l'écran.
 */
export default function TexteAnnonce({
  version: v,
  sku,
  enfiler,
  onVersionModifiee,
}: {
  version: VersionAffichee;
  /** La ligne SKU (la case SKU, pas forcément enregistrée). */
  sku: string | null;
  enfiler: Enfiler;
  onVersionModifiee: (v: VersionEnBase) => void;
}) {
  const premiere = v.id === null;
  const nom = nomVersion(v.numero).replace(" (actuelle)", "");
  const idTitre = useId();
  const idTirets = useId();
  const idMotsCles = useId();

  const [saisie, setSaisie] = useState<Valeurs>({ titre: v.titre, description: v.description, motsCles: v.motsCles });
  const [etats, setEtats] = useState<Partial<Record<ChampTexte, Etat>>>({});
  // Ce qui est ENREGISTRÉ : mis à jour dès la réponse du serveur, sans attendre le rendu du parent.
  const enBase = useRef<Valeurs>({ titre: v.titre, description: v.description, motsCles: v.motsCles });
  useEffect(() => {
    enBase.current.titre = v.titre;
    setSaisie((s) => ({ ...s, titre: v.titre }));
  }, [v.titre]);
  useEffect(() => {
    enBase.current.description = v.description;
    setSaisie((s) => ({ ...s, description: v.description }));
  }, [v.description]);
  useEffect(() => {
    enBase.current.motsCles = v.motsCles;
    setSaisie((s) => ({ ...s, motsCles: v.motsCles }));
  }, [v.motsCles]);

  const [proposee, setProposee] = useState<{ proposition: Proposition; base: Proposition } | null>(null);
  const [attente, setAttente] = useState(false);
  const [garde, setGarde] = useState(false);
  const [erreurIA, setErreurIA] = useState<string | null>(null);
  const [encadre, setEncadre] = useState(false);

  const saisir = (champ: ChampTexte, valeur: string) => {
    setSaisie((s) => ({ ...s, [champ]: valeur }));
    setEtats((e) => ({ ...e, [champ]: undefined }));
  };

  /** Enregistre UN champ (seul champ du corps). true : enregistré, ou rien à enregistrer. */
  async function enregistrer(champ: ChampTexte): Promise<boolean> {
    if (!v.id) return true;
    const id = v.id;
    const lu = lireModificationVersion({ [champ]: saisie[champ] });
    if (!lu.ok) {
      toastErreur(`${LIBELLES[champ]} non enregistré : ${lu.message}`);
      return false;
    }
    const nouveau = lu.donnees[champ] ?? "";
    return enfiler(async () => {
      if (nouveau === enBase.current[champ]) {
        setSaisie((s) => ({ ...s, [champ]: nouveau }));
        return true;
      }
      setEtats((e) => ({ ...e, [champ]: "envoi" }));
      const res = await patchVersion(id, { [champ]: nouveau });
      if (!res.ok) {
        setEtats((e) => ({ ...e, [champ]: undefined }));
        toastErreur(`${LIBELLES[champ]} non enregistré : ${res.message}`);
        return false;
      }
      enBase.current = { titre: res.version.titre, description: res.version.description, motsCles: res.version.motsCles };
      setSaisie((s) => ({ ...s, [champ]: res.version[champ] }));
      setEtats((e) => ({ ...e, [champ]: "enregistre" }));
      onVersionModifiee(res.version);
      return true;
    });
  }

  /** « Reformuler » et « Proposer autre chose » : UN appel, sur clic seulement. */
  async function reformuler() {
    if (!v.id || attente || garde) return;
    setEncadre(true);
    setErreurIA(null);
    setAttente(true);
    try {
      // La reformulation part de ce qui est ENREGISTRÉ : on attend d'abord un enregistrement
      // déjà parti (le champ vient d'être quitté), puis on enregistre ce qui reste à enregistrer.
      await enfiler(async () => undefined);
      for (const champ of ["titre", "motsCles"] as const) {
        if (!(await enregistrer(champ))) {
          setEncadre(false);
          return;
        }
      }
      const res = await fetch(`/api/studio/versions/${v.id}/reformuler`, { method: "POST" });
      if (!res.ok) {
        setErreurIA(await lireErreur(res));
        return;
      }
      const j = (await res.json()) as { proposition: Proposition };
      setProposee({ proposition: j.proposition, base: { titre: enBase.current.titre, motsCles: enBase.current.motsCles } });
    } catch {
      setErreurIA("Connexion perdue : la reformulation n’a pas abouti.");
    } finally {
      setAttente(false);
    }
  }

  /** « Garder » : enregistre le titre et les mots-clés proposés, et RIEN d'autre. */
  async function garder() {
    const id = v.id;
    if (!proposee || !id || garde || attente) return;
    setGarde(true);
    const res = await enfiler(() => patchVersion(id, corpsGarder(proposee.proposition)));
    setGarde(false);
    if (!res.ok) {
      toastErreur(`Reformulation non enregistrée : ${res.message}`);
      return;
    }
    enBase.current = { titre: res.version.titre, description: res.version.description, motsCles: res.version.motsCles };
    setSaisie({ titre: res.version.titre, description: res.version.description, motsCles: res.version.motsCles });
    onVersionModifiee(res.version);
    setProposee(null);
    setEncadre(false);
    setErreurIA(null);
    toastSucces(`Titre et mots-clés de la ${nom} mis à jour.`);
  }

  function fermer() {
    // Fermer n'enregistre rien.
    setProposee(null);
    setEncadre(false);
    setErreurIA(null);
  }

  async function copierTexte(texte: string, quoi: "titre" | "description") {
    if (await copier(texte)) toastSucces(quoi === "titre" ? `Titre de la ${nom} copié.` : `Description de la ${nom} copiée.`);
    else toastErreur("Copie refusée par le navigateur : sélectionne le texte à la main.");
  }

  // Ce qui est à l'écran, pour les copies : la description modifiée comprise.
  const titre = premiere ? v.titre : saisie.titre;
  const tirets = premiere ? v.description : saisie.description;
  const motsCles = premiere ? v.motsCles : saisie.motsCles;
  const description = texteDescription({ tirets, motsCles, sku });
  const longueur = longueurTitre(normaliserTitre(titre));
  const trop = longueur > TITRE_MAX;
  const reformulable = saisie.titre.trim() !== "" && saisie.motsCles.trim() !== "";
  const etat = (champ: ChampTexte) => (
    <span className="text-xs text-ink-3" aria-live="polite">
      {etats[champ] === "envoi" ? "Enregistrement…" : etats[champ] === "enregistre" ? "Enregistré" : ""}
    </span>
  );

  return (
    <>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        <h3 className="text-md font-semibold text-ink">Texte de l’annonce</h3>
        {premiere ? (
          <span className="text-sm text-ink-3">La Version 1 est l’annonce actuelle : elle n’est pas reformulée.</span>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            {!reformulable && <span className="text-sm text-ink-3">Renseigne le titre et les mots-clés pour reformuler.</span>}
            <Button variant="secondary" size="sm" onClick={() => void reformuler()} disabled={!reformulable || garde} pending={attente && !proposee} pendingLabel="Reformulation…">
              <Sparkles size={14} aria-hidden /> Reformuler
            </Button>
          </div>
        )}
      </div>

      {!premiere && encadre && (
        <PropositionReformulation
          base={proposee?.base ?? null}
          proposition={proposee?.proposition ?? null}
          attente={attente}
          enregistrement={garde}
          erreur={erreurIA}
          onGarder={() => void garder()}
          onAutre={() => void reformuler()}
          onFermer={fermer}
        />
      )}

      <div className="mt-3 grid grid-cols-1 items-start gap-4 min-[1100px]:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="rounded-md border border-line bg-surface-2 p-4">
          <div className="mb-2 flex items-center justify-between gap-2.5">
            {premiere ? (
              <span className={LIBELLE}>Titre</span>
            ) : (
              <label htmlFor={idTitre} className={LIBELLE}>
                Titre
              </label>
            )}
            <span className="flex items-center gap-2.5">
              {!premiere && etat("titre")}
              <span className={cn("font-mono text-xs", trop ? "font-bold text-neg" : "text-ink-3")}>
                {longueur} car.{trop ? ` · ${TITRE_MAX} au plus` : ""}
              </span>
              <Button variant="secondary" size="sm" disabled={!titre.trim()} onClick={() => void copierTexte(normaliserTitre(titre), "titre")}>
                <Copy size={14} aria-hidden /> Copier le titre
              </Button>
            </span>
          </div>
          {premiere ? (
            v.titre ? (
              <p data-testid="version-titre" className="text-md font-bold text-ink">
                {v.titre}
              </p>
            ) : (
              <p className="text-base text-ink-3">Pas encore de titre : l’annonce de ce sac n’a pas été générée.</p>
            )
          ) : (
            <Input
              id={idTitre}
              data-testid="version-titre"
              type="text"
              autoComplete="off"
              spellCheck
              value={saisie.titre}
              placeholder="Titre de l’annonce"
              aria-invalid={trop || undefined}
              onChange={(e) => saisir("titre", e.target.value)}
              onBlur={() => void enregistrer("titre")}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void enregistrer("titre");
                }
              }}
              className="font-bold"
            />
          )}
        </div>

        <div className="rounded-md border border-line bg-surface-2 p-4">
          <div className="flex items-center justify-between gap-2.5">
            <span className={LIBELLE}>Description</span>
            <Button variant="secondary" size="sm" disabled={!description} onClick={() => void copierTexte(description, "description")}>
              <Copy size={14} aria-hidden /> Copier la description
            </Button>
          </div>

          <div className="mt-2 rounded-sm border border-line bg-surface-3 p-3 text-ink-3">
            <div className="mb-1.5 flex items-center justify-between gap-2.5">
              {premiere ? (
                <span className="text-xs font-bold uppercase tracking-[0.05em]">Tirets</span>
              ) : (
                <label htmlFor={idTirets} className="text-xs font-bold uppercase tracking-[0.05em]">
                  Tirets
                </label>
              )}
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
                <Lock size={14} aria-hidden /> {premiere ? "Ne change jamais" : "Jamais modifiés par l’IA"}
              </span>
            </div>
            {premiere ? (
              <p data-testid="version-tirets" className="whitespace-pre-line text-base leading-[1.6]" aria-readonly="true">
                {v.description || "Pas encore de description."}
              </p>
            ) : (
              <>
                <Textarea
                  id={idTirets}
                  data-testid="version-tirets"
                  value={saisie.description}
                  rows={Math.min(14, Math.max(4, saisie.description.split("\n").length + 1))}
                  placeholder="Les tirets de la description"
                  onChange={(e) => saisir("description", e.target.value)}
                  onBlur={() => void enregistrer("description")}
                  className="leading-[1.6]"
                />
                <div className="mt-2 flex items-center justify-end gap-2.5">
                  {etat("description")}
                  <Button variant="secondary" size="sm" disabled={etats.description === "envoi"} onClick={() => void enregistrer("description")}>
                    Enregistrer
                  </Button>
                </div>
              </>
            )}
          </div>

          <div className="mt-2 rounded-sm border border-line bg-surface p-3">
            <div className="mb-1.5 flex items-center justify-between gap-2.5">
              {premiere ? (
                <span className={LIBELLE}>Mots-clés</span>
              ) : (
                <label htmlFor={idMotsCles} className={LIBELLE}>
                  Mots-clés
                </label>
              )}
              {!premiere && etat("motsCles")}
            </div>
            {premiere ? (
              <p data-testid="version-mots-cles" className={cn("text-base leading-[1.6]", v.motsCles ? "text-ink" : "text-ink-3")}>
                {v.motsCles || "Pas encore de mots-clés."}
              </p>
            ) : (
              <Textarea
                id={idMotsCles}
                data-testid="version-mots-cles"
                value={saisie.motsCles}
                rows={4}
                placeholder="Les mots-clés, séparés par des virgules"
                onChange={(e) => saisir("motsCles", e.target.value)}
                onBlur={() => void enregistrer("motsCles")}
                onKeyDown={(e) => {
                  // Entrée enregistre (comme le SKU et le titre) ; Maj + Entrée garde un retour à la ligne.
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void enregistrer("motsCles");
                  }
                }}
                className="leading-[1.6]"
              />
            )}
          </div>

          <div className="mt-2 rounded-sm border border-line bg-surface p-3">
            <div className="mb-1.5 flex items-center justify-between gap-2.5">
              <span className={LIBELLE}>Ligne SKU</span>
              <span className="text-xs text-ink-3">reprend la case SKU</span>
            </div>
            <p data-testid="version-ligne-sku" className={cn("font-mono text-base", sku ? "text-ink" : "text-ink-3")}>
              {sku ?? "SKU de l’annonce"}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
