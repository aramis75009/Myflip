"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { objectifLegacy, oublierObjectifLegacy } from "./objectif";
import type {
  ArticleDTO,
  CalendarDTO,
  CommandeDTO,
  CommandeStatsDTO,
  CompteVente,
  DashboardDTO,
  NotificationsDTO,
  PromptTemplateDTO,
  StatsDTO,
  UserSettingsDTO,
} from "./types";

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (res.status === 401) {
    toast.error("Session expirée, reconnecte-toi.");
    setTimeout(() => {
      window.location.href = "/login";
    }, 1500);
    throw new Error("Session expirée.");
  }
  if (!res.ok) {
    let message = "Une erreur est survenue.";
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* corps non-JSON */
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

// Invalide les trois vues dépendantes des données (stock/dashboard/calendrier).
function useInvalidateAll() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["articles"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["calendar"] });
    qc.invalidateQueries({ queryKey: ["commandes"] });
    qc.invalidateQueries({ queryKey: ["stats"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };
}

// ---------- Notifications ----------

export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: () => jsonFetch<NotificationsDTO>("/api/notifications"),
    // Rappels : une donnée un peu fraîche suffit, on rafraîchit à l'ouverture.
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    // Le badge « à comptabiliser » de la sidebar lit cette requête. Sans
    // intervalle, une carte étiquetée sur Trello ne se voyait qu'après un
    // rechargement complet de la page : un compteur figé, peint en rouge.
    // React Query met l'intervalle en pause quand la fenêtre perd le focus
    // (`refetchIntervalInBackground` vaut false par défaut) — rien ne tourne
    // pendant que l'onglet est en arrière-plan.
    refetchInterval: 60_000,
  });
}

/**
 * Nombre d'articles à comptabiliser, pour le badge de navigation.
 *
 * Lit la charge utile des notifications plutôt qu'un endpoint dédié : le
 * compte y est déjà calculé (`/api/notifications`), et la clé `["notifications"]`
 * est déjà invalidée par `useInvalidateAll` — une clé neuve ne l'aurait pas
 * été, et le badge se serait figé après la première comptabilisation.
 *
 * La route omet les entrées à 0, d'où le repli.
 */
export function useCompteAComptabiliser(): number {
  const { data } = useNotifications();
  return data?.items.find((i) => i.key === "a-comptabiliser")?.count ?? 0;
}

// ---------- Articles ----------

export type ArticleFilters = {
  marque?: string;
  lot?: string; // libellé du lot d'achat (« Short Adidas »)
  statut?: string;
  q?: string;
  commande?: string;
};

export function useArticles(filters: ArticleFilters = {}) {
  // Les clés d'`ArticleFilters` sont exactement les noms de paramètres attendus
  // par /api/articles : les valeurs vides sont simplement omises.
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const qs = params.toString();

  return useQuery({
    queryKey: ["articles", filters],
    queryFn: () =>
      jsonFetch<ArticleDTO[]>(`/api/articles${qs ? `?${qs}` : ""}`),
  });
}

export type ArticlePatch = Partial<{
  sku: string;
  marque: string;
  categorie: string;
  /** Libellé du lot d'achat. Absent jusqu'au 11/08/2026 : corriger la marque
   *  d'un article laissait un libellé de lot périmé, non réparable depuis l'UI. */
  lot: string | null;
  grade: string | null;
  statut: string;
  prixAchat: number;
  prixVente: number | null;
  dateVente: string | null;
  canal: string | null;
  titreAnnonce: string | null;
  descriptionAnnonce: string | null;
  motsClesAnnonce: string | null;
  compteVente: CompteVente | null;
}>;

// Champs dont la modification impacte les vues agrégées
// (CA/marge du dashboard, stats, calendrier des ventes).
const AGGREGATE_KEYS: (keyof ArticlePatch)[] = [
  "statut",
  "prixVente",
  "prixAchat",
  "dateVente",
  "canal",
];

/**
 * Variables de `useUpdateArticle`.
 *
 * `differerInvalidation` sert aux enregistrements en série (mise en vente, 5
 * articles) : `statut` fait partie des `AGGREGATE_KEYS`, donc chaque patch
 * invalide articles + dashboard + stats + calendrier. Cinq enregistrements =
 * vingt invalidations, et l'app clignote pendant toute la série. L'appelant
 * pose le drapeau, puis invalide UNE fois à la fin.
 *
 * Absent par défaut : `/stock` et `/a-comptabiliser` gardent le comportement
 * exact qu'ils ont toujours eu.
 */
type UpdateArticleVars = {
  id: string;
  patch: ArticlePatch;
  differerInvalidation?: boolean;
};

export function useUpdateArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateArticleVars) =>
      jsonFetch<ArticleDTO>(`/api/articles/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    // --- Optimistic update : la cellule change visuellement avant la réponse.
    onMutate: async ({ id, patch }) => {
      // Stoppe les refetch en cours pour qu'ils n'écrasent pas l'update optimiste.
      await qc.cancelQueries({ queryKey: ["articles"] });
      // Snapshot de toutes les variantes ["articles", filters] en cache.
      const previous = qc.getQueriesData<ArticleDTO[]>({
        queryKey: ["articles"],
      });
      // Applique le patch à l'article concerné dans chaque entrée de cache.
      qc.setQueriesData<ArticleDTO[]>({ queryKey: ["articles"] }, (old) =>
        old?.map((a) => (a.id === id ? { ...a, ...patch } : a)),
      );
      return { previous };
    },
    // Rollback : on restaure chaque entrée de cache touchée.
    onError: (_err, _vars, ctx) => {
      ctx?.previous?.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    // Invalidation ciblée (cf. lot 1) — exécutée en succès comme en erreur, pour
    // resynchroniser les valeurs serveur (marges/coef recalculés notamment).
    onSettled: (_data, _err, { patch, differerInvalidation }) => {
      // L'appelant a pris la main : il invalidera une fois la série finie.
      if (differerInvalidation) return;
      // Un patch touche toujours la liste des articles.
      qc.invalidateQueries({ queryKey: ["articles"] });
      // On ne recharge dashboard/stats/calendrier que si un champ financier ou
      // temporel a changé. Un patch « simple » (sku, marque, catégorie, grade)
      // ne touche aucun agrégat → pas de refetch inutile.
      if (AGGREGATE_KEYS.some((k) => k in patch)) {
        qc.invalidateQueries({ queryKey: ["dashboard"] });
        qc.invalidateQueries({ queryKey: ["stats"] });
        qc.invalidateQueries({ queryKey: ["calendar"] });
      }
      // Jamais ["commandes"] : un patch d'article ne modifie pas une commande.
    },
  });
}

export function useDeleteArticle() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) =>
      jsonFetch<{ ok: true }>(`/api/articles/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

// ---------- Réglages du compte ----------

export function useReglages() {
  return useQuery({
    queryKey: ["reglages"],
    queryFn: () => jsonFetch<UserSettingsDTO>("/api/user/settings"),
    staleTime: 60_000,
  });
}

/**
 * Objectif de CA mensuel, porté par le compte.
 *
 * Reprend une seule fois l'ancienne valeur du localStorage : uniquement si le
 * compte n'en a pas encore, sinon un vieux navigateur écraserait un objectif
 * fixé depuis un autre appareil.
 */
export function useObjectifMensuel() {
  const { data, isLoading } = useReglages();
  const enregistrer = useSetObjectif();
  const reprise = useRef(false);

  useEffect(() => {
    if (isLoading || !data || reprise.current) return;
    reprise.current = true;
    if (data.objectifMensuel != null) {
      oublierObjectifLegacy();
      return;
    }
    const ancien = objectifLegacy();
    if (ancien != null) {
      enregistrer.mutate(ancien, { onSuccess: oublierObjectifLegacy });
    }
  }, [data, isLoading, enregistrer]);

  return { objectif: data?.objectifMensuel ?? null, isLoading };
}

export function useSetObjectif() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (objectifMensuel: number | null) =>
      jsonFetch<{ ok: true }>("/api/user/settings", {
        method: "PUT",
        body: JSON.stringify({ objectifMensuel }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reglages"] }),
  });
}

// ---------- Commandes ----------

/**
 * Un lot d'achat à créer.
 *
 * Le mode de saisie est une propriété DU LOT, pas de la commande : un même
 * achat peut mêler 50 polos saisis au forfait et 3 sacs saisis pièce par pièce.
 *
 * - LOT   : `quantite` + `prixTotal`, réparti uniformément dans le lot.
 * - PIECE : une entrée par pièce avec son prix réel ; la quantité en découle.
 *
 * `prixTotal` et les prix des pièces sont HORS frais de livraison : le port
 * vit sur la commande et se répartit au prorata sur toutes les pièces de tous
 * les lots.
 */
export type LotInput = {
  /** Libellé du lot. À défaut, le serveur reprend « catégorie + marque ». */
  nom?: string;
  marque: string;
  categorie: string;
  /** Préfixe SKU du lot. À défaut, le serveur reprend la suggestion. */
  prefixeSku?: string;
} & (
  | { modeSaisie: "LOT"; quantite: number; prixTotal: number }
  | { modeSaisie: "PIECE"; pieces: { prixAchat: number }[] }
);

/**
 * Une commande : un fournisseur, une date, des frais de port, et N lots.
 *
 * `coutTotal` et `nbArticles` ne sont jamais envoyés — le serveur les calcule
 * depuis les lots, seule façon de garantir `Σ prixAchat = coutTotal`.
 */
export type CommandeInput = {
  fournisseur: string;
  date: string;
  grade?: string | null;
  coefObjectif?: number | null;
  /** Frais de port de la commande, répartis sur les pièces de tous les lots. */
  fraisLivraison: number;
  lots: LotInput[];
};

export function useCreateCommande() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: CommandeInput) =>
      jsonFetch<CommandeDTO>("/api/commandes", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

export function useCommandes() {
  return useQuery({
    queryKey: ["commandes"],
    queryFn: () => jsonFetch<CommandeDTO[]>("/api/commandes"),
  });
}

export function useCommandeStats(id: string | null) {
  return useQuery({
    queryKey: ["commande-stats", id],
    enabled: !!id,
    queryFn: () => jsonFetch<CommandeStatsDTO>(`/api/commandes/${id}/stats`),
  });
}

export function useDeleteCommande() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) =>
      jsonFetch<{ ok: true }>(`/api/commandes/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

// ---------- Actions groupées / comptabilisation ----------

export function useBulkUpdateStatus() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ ids, statut }: { ids: string[]; statut: string }) =>
      jsonFetch<{ count: number; statut: string }>("/api/articles/bulk", {
        method: "PATCH",
        body: JSON.stringify({ ids, statut }),
      }),
    onSuccess: invalidate,
  });
}

export function useComptabiliser() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({
      id,
      prixVente,
      dateVente,
      canal,
      compteVente,
    }: {
      id: string;
      prixVente: number;
      dateVente: string;
      canal?: string;
      compteVente?: CompteVente;
    }) =>
      jsonFetch<{ article: ArticleDTO; trello: string | null }>(
        `/api/articles/${id}/comptabiliser`,
        {
          method: "POST",
          body: JSON.stringify({ prixVente, dateVente, canal, compteVente }),
        },
      ),
    onSuccess: invalidate,
  });
}

// ---------- Statistiques ----------

// `commandeId` restreint les statistiques à un lot. La clé de cache l'inclut :
// chaque commande garde ses résultats, le retour sur « Tout l'historique » est
// instantané.
export function useStats(commandeId?: string | null) {
  return useQuery({
    queryKey: ["stats", commandeId ?? "all"],
    queryFn: () =>
      jsonFetch<StatsDTO>(
        commandeId
          ? `/api/stats?commande=${encodeURIComponent(commandeId)}`
          : "/api/stats",
      ),
  });
}

// ---------- Dashboard ----------

export type DashboardPeriode = "all" | "month" | "30j" | "3m";

export function useDashboard(periode: DashboardPeriode = "all") {
  return useQuery({
    queryKey: ["dashboard", periode],
    queryFn: () => jsonFetch<DashboardDTO>(`/api/dashboard?periode=${periode}`),
  });
}

// ---------- Calendrier ----------

export function useCalendar(month: string) {
  return useQuery({
    queryKey: ["calendar", month],
    queryFn: () => jsonFetch<CalendarDTO>(`/api/calendar?month=${month}`),
  });
}

// ---------- Prompts (Mise en vente) ----------

export type PromptInput = {
  nom: string;
  marque: string | null;
  categorie: string | null;
  contenu: string;
  estDefaut: boolean;
};

export function usePrompts() {
  return useQuery({
    queryKey: ["prompts"],
    queryFn: () => jsonFetch<PromptTemplateDTO[]>("/api/prompts"),
  });
}

export function useCreatePrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PromptInput) =>
      jsonFetch<PromptTemplateDTO>("/api/prompts", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prompts"] }),
  });
}

export function useUpdatePrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<PromptInput> }) =>
      jsonFetch<PromptTemplateDTO>(`/api/prompts/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prompts"] }),
  });
}

export function useDeletePrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      jsonFetch<{ ok: true }>(`/api/prompts/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prompts"] }),
  });
}

// ---------- Génération d'annonce ----------

export type GenerateInput = {
  sku: string;
  marque: string | null;
  categorie: string | null;
  taille: string | null;
  etat: string | null;
  matiere: string | null;
  details: string | null; // infos supplémentaires libres
  images: string[]; // dataURL base64
  promptId?: string; // prompt choisi manuellement (sinon sélection auto)
};

export type GenerateResult = {
  titre: string;
  description: string;
  motsCles: string;
  promptNom: string;
};

export function useGenerateListing() {
  return useMutation({
    mutationFn: (input: GenerateInput) =>
      jsonFetch<GenerateResult>("/api/listings/generate", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  });
}
