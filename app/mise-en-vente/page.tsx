"use client";

// Assistant de mise en vente, 1 à 5 articles par session.
//
// Ce fichier ORCHESTRE : il tient les effets de bord (réseau, canvas, object
// URLs, sessionStorage) et laisse la logique au reducer, qui est pur et testé.
// Tout ce qui ressemble à une règle métier doit descendre dans `_reducer.ts` —
// c'est le seul endroit où elle sera couverte par un test.
//
//   ÉTAPE 1        ÉTAPE 2                ÉTAPE 3        ÉTAPE 4
//   les SKU   ──▶  rail + fiches     ──▶  génération ──▶ annonces
//   d'un bloc      (photos + QCM)         séquentielle   + statuts

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { useGenerateListing, usePrompts, useUpdateArticle } from "@/lib/hooks";
import { pickPrompt } from "@/lib/promptSelect";
import { pickVintedMapping } from "@/lib/vintedMapping";
import {
  blobToBase64,
  compressForApi,
  encodeRotated,
  loadImageDirect,
  triggerDownload,
} from "@/lib/imageProcessing";
import type { ArticleDTO } from "@/lib/types";
import { Eyebrow } from "@/components/console";
import EtapeSku from "./_components/EtapeSku";
import ExportAnnonces from "./_components/ExportAnnonces";
import FicheArticle from "./_components/FicheArticle";
import FileGeneration from "./_components/FileGeneration";
import RailArticles from "./_components/RailArticles";
import { descripteurBarre } from "./_barreAction";
import { ecrire, effacer, lire } from "./_persistance";
import {
  extensionPresente,
  publierVinted as orchestrerPublicationVinted,
} from "./_publierVinted";
import {
  etatInitial,
  fichePrete,
  MAX_PHOTOS,
  reducerMev,
  skuEnDoublon,
  type ArticleEnCours,
  type Photo,
} from "./_reducer";
import { btnGhost, cardCls } from "./_ui";

/** Longueur de titre visée par les prompts (« saturer 100 sans dépasser »). */
const TITRE_MAX = 100;

/**
 * Identifiant de la PREMIÈRE fiche : déterministe, obligatoirement.
 *
 * ⚠️ L'initialiseur de `useReducer` s'exécute au rendu serveur ET au rendu
 * client. Un id tiré de `Date.now()` / `Math.random()` y produit deux valeurs
 * différentes, donc des `id=` et des `key=` qui ne correspondent pas : React
 * signale un décalage d'hydratation et n'applique pas le HTML serveur.
 */
const PREMIERE_FICHE = "fiche-1";

/** Fiches ajoutées ensuite : uniquement depuis une interaction, donc côté
 *  client seulement — l'aléatoire n'y pose aucun problème. */
const nouvelId = () =>
  `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const ETAPES = ["SKU", "Fiches", "Génération", "Annonces"] as const;

export default function MiseEnVentePage() {
  const [etat, dispatch] = useReducer(reducerMev, undefined, () =>
    etatInitial(PREMIERE_FICHE),
  );
  const [genEnCours, setGenEnCours] = useState(false);
  /**
   * Fiches du lot en cours de génération.
   *
   * L'écran d'attente doit compter CE lot, pas toute la session : avec deux
   * fiches dont une seule est prête, un dénominateur global affichait « 1 / 2 »
   * à la fin — un succès complet qui ressemble à un échec.
   */
  const [lotGeneration, setLotGeneration] = useState<string[]>([]);
  const [saveEnCours, setSaveEnCours] = useState(false);
  const [zoom, setZoom] = useState<{ ficheId: string; photoId: string } | null>(null);
  const [choixPrompt, setChoixPrompt] = useState(false);

  const { data: prompts = [] } = usePrompts();
  const generate = useGenerateListing();
  const updateArticle = useUpdateArticle();
  const queryClient = useQueryClient();

  const fiche = etat.fiches.find((f) => f.id === etat.active) ?? etat.fiches[0];
  const doublons = useMemo(() => skuEnDoublon(etat.fiches), [etat.fiches]);

  // Miroir de l'état pour les boucles asynchrones : une closure capturée au
  // lancement de la file lirait un état figé au premier tour.
  const etatRef = useRef(etat);
  etatRef.current = etat;

  // Compteur de recherche, PAR FICHE. Généré ici et non dans le reducer :
  // `useReducer` ne rend pas la valeur dispatchée, donc le handler asynchrone
  // ne pourrait pas relire le numéro qu'il vient d'incrémenter.
  const seqRef = useRef<Record<string, number>>({});

  // ── Persistance de session ──────────────────────────────────────────────
  const hydrate = useRef(false);
  useEffect(() => {
    const restaure = lire();
    if (restaure) {
      dispatch({ type: "session/restaure", etat: restaure });
      const aChercher = restaure.fiches.filter((f) => f.sku.trim());
      if (aChercher.length > 0) {
        toast.info(
          `Session restaurée : ${aChercher.length} article${aChercher.length > 1 ? "s" : ""}. Les photos sont à remettre.`,
        );
        // Les recherches repartent : l'article n'est pas persisté, son statut
        // et son prix ont pu changer entre-temps.
        aChercher.forEach((f) => void chercherSku(f.id, f.sku));
      }
    }
    hydrate.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (hydrate.current) ecrire(etat);
  }, [etat]);

  // ── Filet contre la fermeture d'onglet ──────────────────────────────────
  // Les photos et les annonces non enregistrées ne survivent pas à un Cmd-W.
  // À cinq articles, la perte vaut l'avertissement.
  useEffect(() => {
    const enJeu = etat.fiches.some(
      (f) => f.photos.length > 0 || (f.generation.phase === "ok" && !f.enregistre),
    );
    if (!enJeu) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [etat.fiches]);

  // ── Filet contre le dépôt manqué ────────────────────────────────────────
  // Comportement par défaut du navigateur : un fichier lâché n'importe où dans
  // la fenêtre est OUVERT, ce qui quitte la page. Les photos ne sont pas
  // persistées (un Blob ne rentre pas dans sessionStorage, cf. _persistance),
  // donc viser à côté de la fiche coûtait tout ce qui était déjà chargé.
  // Ici, un dépôt hors zone ne fait plus rien du tout.
  useEffect(() => {
    const neutraliser = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragover", neutraliser);
    window.addEventListener("drop", neutraliser);
    return () => {
      window.removeEventListener("dragover", neutraliser);
      window.removeEventListener("drop", neutraliser);
    };
  }, []);

  // ── Object URLs : révoqués ICI, jamais dans le reducer ──────────────────
  // Un reducer est invoqué DEUX FOIS en StrictMode React 18 : y révoquer une
  // URL la libérerait pendant que l'image l'affiche encore.
  const urlsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const vivantes = new Set(
      etat.fiches.flatMap((f) => f.photos.map((p) => p.url)),
    );
    for (const url of urlsRef.current) {
      if (!vivantes.has(url)) URL.revokeObjectURL(url);
    }
    urlsRef.current = vivantes;
  }, [etat.fiches]);
  useEffect(() => {
    const set = urlsRef.current;
    return () => set.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  // ── Étape 1 : recherche des SKU ─────────────────────────────────────────
  async function chercherSku(id: string, skuBrut?: string) {
    const cible = etatRef.current.fiches.find((f) => f.id === id);
    const q = (skuBrut ?? cible?.sku ?? "").trim();
    if (!q) return;
    const seq = (seqRef.current[id] ?? 0) + 1;
    seqRef.current[id] = seq;
    dispatch({ type: "sku/lookup", id, seq });
    try {
      const res = await fetch(`/api/articles?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error("Erreur lors de la recherche.");
      const liste = (await res.json()) as ArticleDTO[];
      const match = liste.find((a) => a.sku.toLowerCase() === q.toLowerCase());
      if (!match) {
        dispatch({ type: "sku/echec", id, seq, message: `Aucun article pour « ${q} ».` });
        return;
      }
      dispatch({ type: "sku/resolu", id, seq, article: match });
    } catch (err) {
      dispatch({
        type: "sku/echec",
        id,
        seq,
        message: err instanceof Error ? err.message : "Recherche impossible.",
      });
    }
  }

  // ── Photos ──────────────────────────────────────────────────────────────
  async function ajouterPhotos(ficheId: string, files: File[]) {
    if (files.length === 0) return;
    const cible = etatRef.current.fiches.find((f) => f.id === ficheId);
    const place = MAX_PHOTOS - (cible?.photos.length ?? 0);
    const aTraiter = files.slice(0, Math.max(0, place));
    const ignores: string[] = [];
    const prets: Photo[] = [];

    for (const file of aTraiter) {
      try {
        const base = await loadImageDirect(file);
        const blob = await encodeRotated(base, 0);
        prets.push({
          id: `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          base,
          rotation: 0,
          url: URL.createObjectURL(blob),
          blob,
        });
      } catch {
        // Un fichier illisible disparaissait sans un mot dans l'ancienne
        // version : on croyait avoir déposé 3 photos, il y en avait 2.
        ignores.push(file.name);
      }
    }

    if (prets.length > 0) dispatch({ type: "photo/ajout", id: ficheId, photos: prets });
    if (files.length > place) {
      toast.warning(`${files.length - place} photo(s) non ajoutée(s) : limite de ${MAX_PHOTOS}.`);
    }
    if (ignores.length > 0) {
      toast.error(`Fichier(s) illisible(s), ignoré(s) : ${ignores.join(", ")}`, {
        duration: 8000,
      });
    }
  }

  async function tourner(ficheId: string, photoId: string, delta: number) {
    const f = etatRef.current.fiches.find((x) => x.id === ficheId);
    const p = f?.photos.find((x) => x.id === photoId);
    if (!p) return;
    const rotation = (((p.rotation + delta) % 360) + 360) % 360;
    try {
      // Deux chemins, et l'angle n'est PAS le même :
      //  • `base` présent  → canvas d'origine, on applique la rotation ABSOLUE ;
      //  • `base` libéré   → on re-décode `blob`, DÉJÀ tourné de p.rotation,
      //    donc on n'applique que le DELTA. Confondre les deux tourne double.
      const blob = p.base
        ? await encodeRotated(p.base, rotation)
        : await encodeRotated(
            await loadImageDirect(p.blob),
            (((delta % 360) + 360) % 360),
          );
      dispatch({
        type: "photo/rotation",
        id: ficheId,
        photoId,
        rotation,
        url: URL.createObjectURL(blob),
        blob,
      });
    } catch {
      toast.error("Rotation impossible sur cette photo.");
    }
  }

  // ── Étape 3 : la file de génération ─────────────────────────────────────
  async function genererFiches(ids: string[]) {
    if (ids.length === 0) return;
    setGenEnCours(true);
    setLotGeneration(ids);
    dispatch({ type: "etape", etape: 3 });
    // Le canvas pleine résolution ne sert plus qu'aux rotations : le libérer
    // ici fait tomber la mémoire retenue d'environ 48 Mo à ~4 Mo par photo.
    // `blob` reste intact — c'est lui qui part sur Vinted.
    dispatch({ type: "photo/liberer-base" });

    for (const id of ids) {
      const f = etatRef.current.fiches.find((x) => x.id === id);
      if (!f?.article) continue;
      dispatch({ type: "generation/debut", id });
      try {
        const choisies = f.selected
          .map((pid) => f.photos.find((p) => p.id === pid))
          .filter((p): p is Photo => !!p);
        const images = await Promise.all(
          choisies.map(async (p) => {
            const compressed = await compressForApi(p.blob);
            return `data:image/jpeg;base64,${await blobToBase64(compressed)}`;
          }),
        );
        const res = await generate.mutateAsync({
          sku: f.article.sku,
          marque: f.qcm.marque || null,
          categorie: f.qcm.categorie || null,
          taille: f.qcm.taille || null,
          etat: f.qcm.etat || null,
          matiere: [f.qcm.matiere, f.qcm.matiere2].filter(Boolean).join(" / ") || null,
          details: f.qcm.details.trim() || null,
          images,
          // Envoyé UNIQUEMENT si l'utilisateur a choisi explicitement. Sinon le
          // serveur applique `pickPrompt` sur la marque et la catégorie de CET
          // article : cinq marques différentes = cinq prompts différents. Poser
          // un promptId unique pour la session ferait générer les cinq annonces
          // avec le prompt de la première, en silence.
          promptId: f.promptId ?? undefined,
        });
        dispatch({ type: "generation/ok", id, resultat: res });

        const vides = [
          !res.titre.trim() && "le titre",
          !res.description.trim() && "la description",
          !res.motsCles.trim() && "les mots-clés",
        ].filter(Boolean) as string[];
        if (vides.length > 0) {
          toast.warning(`${f.article.sku} : le modèle n'a pas rempli ${vides.join(" et ")}.`);
        } else if (res.titre.length > TITRE_MAX) {
          toast.warning(
            `${f.article.sku} : titre de ${res.titre.length} caractères (limite ${TITRE_MAX}).`,
          );
        }
      } catch (err) {
        // Le catch couvre AUSSI ce qui casse avant l'appel réseau (compression,
        // encodage). L'ancienne version ne testait que `generate.isError`, qui
        // reste à false dans ce cas : l'écran tournait indéfiniment.
        dispatch({
          type: "generation/echec",
          id,
          message: err instanceof Error ? err.message : "Échec de la génération.",
        });
      }
    }

    setGenEnCours(false);
    // On ne saute à l'export que si TOUT le lot est passé : sinon l'écran de
    // file reste, avec ses boutons « Relancer » sur les fiches en échec.
    const duLot = etatRef.current.fiches.filter((f) => ids.includes(f.id));
    if (duLot.every((f) => f.generation.phase === "ok")) {
      dispatch({ type: "etape", etape: 4 });
    }
  }

  // ── Étape 4 : enregistrement ────────────────────────────────────────────
  // EN SÉRIE, jamais en parallèle. `useUpdateArticle` prend un instantané du
  // cache ["articles"] entier dans `onMutate` et le restaure dans `onError` :
  // deux enregistrements qui se chevauchent, et l'échec du premier efface
  // l'update optimiste du second. Sérialiser ici rend l'instantané correct,
  // sans toucher à un hook partagé par /stock et /a-comptabiliser.
  // Renvoie `true` si TOUS les ids demandés ont été enregistrés avec succès.
  // Les appelants existants (`onEnregistrer`, `onEnregistrerTout`) ignorent
  // cette valeur via `void enregistrer(...)` — le comportement observable
  // pour eux ne change pas. `publierVinted` l'utilise, lui, pour décider si
  // l'onglet Vinted doit s'ouvrir : ne JAMAIS retirer cette valeur de retour
  // sans vérifier ce que ça casserait côté extension (cf. _publierVinted.ts).
  async function enregistrer(ids: string[], statut: string): Promise<boolean> {
    setSaveEnCours(true);
    const reussites = new Set<string>();
    for (const id of ids) {
      const f = etatRef.current.fiches.find((x) => x.id === id);
      if (!f?.article) continue;
      try {
        await updateArticle.mutateAsync({
          id: f.article.id,
          patch: {
            titreAnnonce: f.annonce.titre,
            descriptionAnnonce: f.annonce.description,
            motsClesAnnonce: f.annonce.motsCles,
            prixVente: f.qcm.prix ? Number(f.qcm.prix) : undefined,
            statut,
          },
          // `statut` déclenche quatre invalidations par patch : à cinq
          // articles, l'app clignoterait vingt fois pendant la série. On
          // invalide une seule fois, en sortie de boucle.
          differerInvalidation: true,
        });
        dispatch({ type: "enregistre", id, statut });
        reussites.add(id);
      } catch (err) {
        dispatch({
          type: "enregistrement/echec",
          id,
          message: err instanceof Error ? err.message : "Échec de l'enregistrement.",
        });
        toast.error(`${f.article.sku} : enregistrement impossible.`, { duration: 8000 });
      }
    }
    // Une fois, à la fin — y compris si des enregistrements ont échoué : le
    // cache doit refléter ce qui est réellement passé.
    for (const cle of ["articles", "dashboard", "stats", "calendar", "notifications"]) {
      queryClient.invalidateQueries({ queryKey: [cle] });
    }
    setSaveEnCours(false);
    return ids.every((id) => reussites.has(id));
  }

  // ── Publier sur Vinted ──────────────────────────────────────────────────
  // Le PATCH avant tout, l'événement ensuite — et seulement si le PATCH a
  // réussi. L'orchestration (garde succès/échec) est une fonction PURE dans
  // _publierVinted.ts, testée sans DOM ; ici on ne branche que le vrai effet
  // de bord (événement DOM). C'est l'extension qui ouvre l'onglet Vinted en
  // réaction à l'événement — plus la page.
  async function publierVinted(f: ArticleEnCours) {
    const ok = await orchestrerPublicationVinted(
      f,
      (id, statut) => enregistrer([id], statut),
      (detail) => window.dispatchEvent(new CustomEvent("myflip:publier-vinted", { detail })),
    );
    // Sans extension, personne n'ouvrira l'onglet : on le fait, comme avant.
    // Le popup peut être bloqué (on sort d'un await) — c'est le prix du repli,
    // et il ne concerne que le cas « extension non installée ».
    if (ok && !extensionPresente()) {
      window.open("https://www.vinted.fr/items/new", "_blank", "noopener,noreferrer");
    }
    return ok;
  }

  // Toutes les fiches éligibles, EN SÉRIE. Le parallèle est exclu pour la même
  // raison que l'enregistrement groupé (instantané du cache dans onMutate),
  // et parce que N événements émis d'un coup produiraient N onglets d'un coup
  // côté extension — exactement ce que l'ordonnanceur cherche à éviter.
  async function publierVintedTout() {
    const eligibles = etatRef.current.fiches.filter(
      (f) =>
        f.generation.phase === "ok" &&
        f.article !== null &&
        pickVintedMapping(f.qcm.marque, f.qcm.categorie) !== null &&
        f.qcm.couleurs.length > 0,
    );
    for (const f of eligibles) {
      // `f` est un instantané pris au clic : si la fiche n+2 est éditée
      // pendant que la chaîne traite la fiche n, ce texte est périmé.
      // `enregistrer()` relit déjà l'état frais de son côté (etatRef.current)
      // et patche la base avec le texte à jour — la fiche envoyée à
      // l'extension doit donc être relue fraîche elle aussi, sous peine que
      // la base et le formulaire Vinted rempli par l'extension divergent
      // silencieusement.
      const fraiche = etatRef.current.fiches.find((x) => x.id === f.id);
      // Disparue du lot pendant la chaîne (retirée par l'utilisateur) : pas
      // un échec, on passe à la suivante sans arrêter la chaîne.
      if (!fraiche) continue;
      const ok = await publierVinted(fraiche);
      if (!ok) {
        toast.error(`${fraiche.article!.sku} : mise en file impossible, chaîne arrêtée.`, {
          duration: 8000,
        });
        return;
      }
    }
  }

  // ── Barre d'action ──────────────────────────────────────────────────────
  // Ce qu'elle DIT est calculé par un module pur et testé ; il ne reste ici
  // qu'à traduire l'intention en effet de bord.
  const barre = descripteurBarre(etat);

  function agir() {
    switch (barre.intention) {
      case "continuer":
        return dispatch({ type: "etape", etape: 2 });
      case "generer":
        return void genererFiches(etat.fiches.filter(fichePrete).map((f) => f.id));
      case "nouvelle-session":
        effacer();
        return dispatch({ type: "reset", id: PREMIERE_FICHE });
      case "attendre":
        return;
    }
  }

  const photoZoomee = zoom
    ? etat.fiches.find((f) => f.id === zoom.ficheId)?.photos.find((p) => p.id === zoom.photoId)
    : null;

  useEffect(() => {
    if (!photoZoomee) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setZoom(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photoZoomee]);

  const nomPromptDetecte = fiche.promptId
    ? (prompts.find((p) => p.id === fiche.promptId)?.nom ?? "inconnu")
    : (pickPrompt(prompts, fiche.qcm.marque || null, fiche.qcm.categorie || null)?.nom ??
      "aucun");

  return (
    <main className="min-h-screen bg-[var(--bg)] p-[14px] pb-40 text-[var(--ink)] min-[900px]:p-[18px] min-[900px]:pb-32">
      <header className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Eyebrow>SKU → FICHES → GÉNÉRATION → ANNONCES</Eyebrow>
        <div className="flex flex-wrap items-center gap-1.5">
          {ETAPES.map((label, i) => {
            const n = (i + 1) as 1 | 2 | 3 | 4;
            // L'étape Annonces reste atteignable tant qu'une annonce existe :
            // sinon, revenir corriger une fiche condamnait à tout regénérer
            // pour relire un texte déjà écrit.
            const fait =
              n < etat.etape ||
              (n === 4 && etat.fiches.some((f) => f.generation.phase === "ok"));
            const courant = n === etat.etape;
            return (
              <button
                key={label}
                type="button"
                disabled={!fait}
                onClick={() => fait && dispatch({ type: "etape", etape: n })}
                className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-full px-3 font-mono text-[10.5px] uppercase tracking-[0.08em] transition-colors disabled:cursor-default ${
                  courant
                    ? "bg-[var(--acc)] font-bold text-[var(--acc-ink)]"
                    : fait
                      ? "bg-[var(--surface-2)] text-[var(--ink2)] hover:text-[var(--acc)]"
                      : "text-[var(--faint-2)]"
                }`}
              >
                {n}. {label}
              </button>
            );
          })}
        </div>
      </header>

      <div className="mx-auto max-w-[1100px]">
        {etat.etape === 1 && (
          <EtapeSku
            fiches={etat.fiches}
            onSaisie={(id, sku) => dispatch({ type: "sku/saisie", id, sku })}
            onChercher={(id) => void chercherSku(id)}
            onAjout={() => dispatch({ type: "fiche/ajout", id: nouvelId() })}
            onRetrait={(id) => dispatch({ type: "fiche/retrait", id })}
          />
        )}

        {etat.etape === 2 && (
          <div className="flex gap-[18px]">
            <RailArticles
              fiches={etat.fiches}
              active={etat.active}
              onActive={(id) => dispatch({ type: "fiche/active", id })}
              onAjout={() => dispatch({ type: "fiche/ajout", id: nouvelId() })}
              onRetrait={(id) => dispatch({ type: "fiche/retrait", id })}
            />
            <div className="min-w-0 flex-1">
              {/* Sous 768 px le rail est masqué : on affiche au moins de quel
                  article il s'agit, sinon l'écran ne dit plus rien. */}
              <div className="mb-3 flex items-center gap-2.5 md:hidden">
                <span className="font-mono text-[12.5px] font-bold">
                  {fiche.sku.trim() || "—"}
                </span>
                <span className="text-[12px] text-[var(--faint-2)]">
                  fiche {etat.fiches.findIndex((f) => f.id === fiche.id) + 1} sur{" "}
                  {etat.fiches.length}
                </span>
              </div>
              {fiche.article ? (
                <FicheArticle
                  fiche={fiche}
                  active
                  prompts={prompts}
                  nomPromptDetecte={nomPromptDetecte}
                  onPhotos={(files) => void ajouterPhotos(fiche.id, files)}
                  onRetraitPhoto={(photoId) =>
                    dispatch({ type: "photo/retrait", id: fiche.id, photoId })
                  }
                  onRotation={(photoId, delta) => void tourner(fiche.id, photoId, delta)}
                  onSelection={(photoId) =>
                    dispatch({ type: "photo/selection", id: fiche.id, photoId })
                  }
                  onZoom={(photoId) => setZoom({ ficheId: fiche.id, photoId })}
                  onQcm={(champ, valeur) =>
                    dispatch({ type: "qcm", id: fiche.id, champ, valeur })
                  }
                  onPrompt={(promptId) =>
                    dispatch({ type: "prompt", id: fiche.id, promptId })
                  }
                  montrerChoixPrompt={choixPrompt}
                  onBasculerChoixPrompt={() => setChoixPrompt((v) => !v)}
                />
              ) : (
                <div className={`${cardCls} px-6 py-12 text-center`}>
                  <p className="text-[14px] font-medium text-[var(--muted)]">
                    Cette fiche n&apos;a pas encore d&apos;article valide.
                  </p>
                  <button
                    onClick={() => dispatch({ type: "etape", etape: 1 })}
                    className={`${btnGhost} mx-auto mt-4`}
                  >
                    <ArrowLeft className="h-[17px] w-[17px]" strokeWidth={2.3} />
                    Revenir aux SKU
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {etat.etape === 3 && (
          <FileGeneration
            fiches={etat.fiches.filter((f) => lotGeneration.includes(f.id))}
            enCours={genEnCours}
            onRelancer={(id) => void genererFiches([id])}
            onRetour={() => dispatch({ type: "etape", etape: 2 })}
            onVoirResultats={() => dispatch({ type: "etape", etape: 4 })}
          />
        )}

        {etat.etape === 4 && (
          <ExportAnnonces
            fiches={etat.fiches}
            doublons={doublons}
            enregistrementEnCours={saveEnCours}
            onEnregistrer={(id, statut) => void enregistrer([id], statut)}
            onEnregistrerTout={(statut) =>
              void enregistrer(
                etat.fiches.filter((f) => f.generation.phase === "ok").map((f) => f.id),
                statut,
              )
            }
            onPublierVinted={(id) => {
              const f = etat.fiches.find((x) => x.id === id);
              if (f) void publierVinted(f);
            }}
            onPublierVintedTout={() => void publierVintedTout()}
            onEditerAnnonce={(id, champ, valeur) =>
              dispatch({ type: "annonce", id, champ, valeur })
            }
            onTelecharger={(ficheId, photoId) => {
              const f = etat.fiches.find((x) => x.id === ficheId);
              const p = f?.photos.find((x) => x.id === photoId);
              const i = f?.photos.findIndex((x) => x.id === photoId) ?? 0;
              if (!f || !p) return;
              triggerDownload(
                p.blob,
                `${f.article?.sku ?? "PHOTO"}_${String(i + 1).padStart(2, "0")}.jpg`,
              );
            }}
          />
        )}
      </div>

      {/* Zoom photo */}
      {photoZoomee && (
        <div
          onClick={() => setZoom(null)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--ink)]/80 p-6"
        >
          <button
            onClick={() => setZoom(null)}
            aria-label="Fermer"
            className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-[var(--ink)]"
          >
            <X className="h-5 w-5" strokeWidth={2.4} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoZoomee.url}
            alt=""
            className="max-h-full max-w-full rounded-[16px] object-contain"
          />
        </div>
      )}

      {/* Barre d'action collante */}
      {/* `bottom-[68px]` sous 768 px : le dock mobile occupe déjà le bas de
          l'écran, et deux barres en `bottom-0` se recouvrent. */}
      <div className="fixed bottom-[68px] left-0 z-40 w-full border-t border-[var(--border)] bg-surface/95 px-4 py-3 backdrop-blur-md md:bottom-0 md:pl-[calc(var(--sidebar-w)+18px)] md:pr-[18px]">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-4">
          <span
            className={`min-w-0 truncate text-[12.5px] font-medium ${
              barre.ok ? "text-[var(--pos)]" : "text-[var(--faint-2)]"
            }`}
          >
            {barre.indice}
          </span>
          <div className="flex flex-none items-center gap-2.5">
            {barre.retourPossible && (
              <button
                onClick={() =>
                  dispatch({
                    type: "etape",
                    etape: Math.max(1, etat.etape - 1) as 1 | 2 | 3,
                  })
                }
                className={btnGhost}
              >
                <ArrowLeft className="h-[17px] w-[17px]" strokeWidth={2.3} />
                Retour
              </button>
            )}
            <button
              onClick={agir}
              disabled={!barre.actif}
              className="inline-flex min-h-[46px] items-center gap-2 rounded-xl bg-[var(--acc)] px-5 text-[14px] font-bold text-[var(--acc-ink)] transition-colors hover:bg-[var(--acc-hover)] disabled:opacity-50"
            >
              {barre.label}
              {barre.icone === "etincelles" ? (
                <Sparkles className="h-[17px] w-[17px]" strokeWidth={2.2} />
              ) : (
                <ArrowRight className="h-[17px] w-[17px]" strokeWidth={2.3} />
              )}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
