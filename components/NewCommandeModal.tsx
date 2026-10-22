"use client";
// design-tokens-dette: R13 → M4

import { useId, useMemo, useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import Modal from "./Modal";
import { useCreateCommande, type LotInput } from "@/lib/hooks";
import {
  euros,
  libelleLot,
  normaliserPrefixe,
  repartirFrais,
  skuPrefix,
} from "@/lib/calc";

const MARQUES = ["Polo Ralph Lauren", "Lacoste", "Tommy Hilfiger"];

/** Une pièce saisie individuellement. Le prix reste une chaîne tant qu'on tape. */
type PieceForm = { id: number; prix: string };

/**
 * Un lot en cours de saisie.
 *
 * `nom` et `prefixe` vides = « suivre la suggestion », même convention que le
 * serveur : l'utilisateur voit une proposition en filigrane, pas une valeur à
 * effacer avant d'écrire la sienne.
 */
type LotForm = {
  id: number;
  nom: string;
  marque: string;
  categorie: string;
  prefixe: string;
  mode: "LOT" | "PIECE";
  quantite: string;
  prixTotal: string;
  pieces: PieceForm[];
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

let compteur = 0;
const nouveauLot = (marque = MARQUES[0], categorie = "Polo"): LotForm => ({
  id: ++compteur,
  nom: "",
  marque,
  categorie,
  prefixe: "",
  mode: "LOT",
  quantite: "",
  prixTotal: "",
  pieces: [{ id: ++compteur, prix: "" }],
});

/** Prix bruts (hors port) d'un lot, ou null si la saisie n'est pas exploitable. */
function prixDuLot(l: LotForm): number[] | null {
  if (l.mode === "PIECE") {
    const prix = l.pieces.map((p) => Number(p.prix));
    if (l.pieces.length === 0) return null;
    // Un prix nul est légitime : pièce offerte dans le lot.
    if (prix.some((p) => !Number.isFinite(p) || p < 0)) return null;
    return prix;
  }
  const q = Number(l.quantite);
  const t = Number(l.prixTotal);
  if (!Number.isInteger(q) || q <= 0) return null;
  if (!Number.isFinite(t) || t < 0) return null;
  return Array.from({ length: q }, () => t / q);
}

export default function NewCommandeModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const create = useCreateCommande();
  const formId = useId();

  const [fournisseur, setFournisseur] = useState("");
  const [date, setDate] = useState(todayISO());
  const [grade, setGrade] = useState("");
  const [coefObjectif, setCoefObjectif] = useState("2.5");
  const [fraisLivraison, setFraisLivraison] = useState("");

  const [lots, setLots] = useState<LotForm[]>([nouveauLot()]);
  // Un seul lot ouvert à la fois : c'est ce qui rend une commande à trois lots
  // lisible sur un téléphone.
  const [ouvert, setOuvert] = useState<number | null>(lots[0].id);

  const majLot = (id: number, patch: Partial<LotForm>) =>
    setLots((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const nomEffectif = (l: LotForm) =>
    l.nom.trim() || libelleLot(l.marque, l.categorie);
  const prefixeEffectif = (l: LotForm) =>
    normaliserPrefixe(l.prefixe) || skuPrefix(l.marque, l.categorie.trim());

  // Aperçu. Utilise `repartirFrais`, la même fonction que le serveur, sur la
  // liste aplatie de toutes les pièces de tous les lots : ce que l'utilisateur
  // voit est exactement ce qui sera enregistré.
  const apercu = useMemo(() => {
    const parLot = lots.map(prixDuLot);
    if (parLot.some((p) => p === null)) return null;

    const frais = Number(fraisLivraison || 0);
    if (!Number.isFinite(frais) || frais < 0) return null;

    const bruts = parLot.flat() as number[];
    if (bruts.length === 0) return null;

    const avecFrais = repartirFrais(bruts, frais);
    const total = avecFrais.reduce((s, p) => s + p, 0);

    let curseur = 0;
    const lignes = lots.map((l, i) => {
      const prix = parLot[i] as number[];
      const tranche = avecFrais.slice(curseur, curseur + prix.length);
      curseur += prix.length;
      return {
        id: l.id,
        nom: nomEffectif(l) || `Lot ${i + 1}`,
        nb: prix.length,
        somme: prix.reduce((s, p) => s + p, 0),
        avecFrais: tranche.reduce((s, p) => s + p, 0),
      };
    });

    return { lignes, frais, total, nb: bruts.length };
  }, [lots, fraisLivraison]);

  const reset = () => {
    setFournisseur("");
    setDate(todayISO());
    setGrade("");
    setCoefObjectif("2.5");
    setFraisLivraison("");
    const l = nouveauLot();
    setLots([l]);
    setOuvert(l.id);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const coefObj = Number(coefObjectif);

    const payload: LotInput[] = lots.map((l) => {
      const commun = {
        nom: nomEffectif(l),
        marque: l.marque.trim(),
        categorie: l.categorie.trim(),
        // Envoyé résolu, jamais brut : le serveur retomberait sinon sur sa
        // propre suggestion, et les SKU annoncés ne seraient pas ceux créés.
        prefixeSku: prefixeEffectif(l),
      };
      return l.mode === "PIECE"
        ? {
            ...commun,
            modeSaisie: "PIECE",
            pieces: l.pieces.map((p) => ({ prixAchat: Number(p.prix) })),
          }
        : {
            ...commun,
            modeSaisie: "LOT",
            quantite: Number(l.quantite),
            prixTotal: Number(l.prixTotal),
          };
    });

    await create.mutateAsync({
      fournisseur: fournisseur.trim(),
      date: new Date(date).toISOString(),
      grade: grade.trim() || null,
      coefObjectif: Number.isFinite(coefObj) && coefObj > 0 ? coefObj : null,
      fraisLivraison: Number(fraisLivraison || 0),
      lots: payload,
    });

    reset();
    onClose();
  };

  const field =
    "w-full rounded-md border border-line bg-surface px-3 py-2.5 text-base text-ink outline-none focus:border-accent focus:ring-2 focus:ring-focus";
  const label = "mb-1.5 block text-xs font-medium text-ink-2";

  const prêt =
    apercu != null &&
    apercu.total > 0 &&
    lots.every((l) => l.marque.trim() && l.categorie.trim());

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nouvelle commande"
      footer={
        <div className="flex items-center justify-between gap-3">
          {/* Masqué sur mobile : le total figure déjà dans le récapitulatif
              juste au-dessus, et à 390 px il passait sur deux lignes. */}
          <span className="hidden text-xs font-medium text-ink-3 sm:inline">
            {apercu ? (
              <>
                {apercu.nb} pièce{apercu.nb > 1 ? "s" : ""} ·{" "}
                <b className="font-mono text-ink">{euros(apercu.total)}</b>
              </>
            ) : (
              "Saisie incomplète"
            )}
          </span>
          <div className="flex flex-1 justify-end gap-2 sm:flex-none">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-full border border-line px-5 text-base font-medium text-ink-2 transition-colors hover:bg-surface-2"
            >
              Annuler
            </button>
            <button
              type="submit"
              form={formId}
              disabled={create.isPending || !prêt}
              className="min-h-11 rounded-full bg-accent px-5 text-base font-medium text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              {create.isPending ? "Création…" : "Créer"}
            </button>
          </div>
        </div>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-4">
        {/* ── Ce qui vaut pour toute la commande ── */}
        <div>
          <label className={label} htmlFor="fournisseur">
            Fournisseur
          </label>
          <input
            id="fournisseur"
            required
            value={fournisseur}
            onChange={(e) => setFournisseur(e.target.value)}
            placeholder="Nom du grossiste"
            className={field}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="date">
              Date
            </label>
            <input
              id="date"
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={field}
            />
          </div>
          <div>
            <label className={label} htmlFor="frais">
              Frais de livraison (€)
            </label>
            <input
              id="frais"
              type="number"
              step="any"
              min="0"
              value={fraisLivraison}
              onChange={(e) => setFraisLivraison(e.target.value)}
              placeholder="0"
              aria-describedby="aide-frais"
              className={field}
            />
          </div>
        </div>
        <p id="aide-frais" className="-mt-2 text-xs font-medium text-ink-3">
          Répartis au prorata du prix de chaque pièce, tous lots confondus. Un
          lot cher en absorbe davantage.
        </p>

        {/* ── Les lots ── */}
        <fieldset className="space-y-2">
          <legend className={label}>Lots de la commande</legend>

          {lots.map((l, i) => {
            const estOuvert = ouvert === l.id;
            const ligne = apercu?.lignes.find((x) => x.id === l.id);
            return (
              <div
                key={l.id}
                className="overflow-hidden rounded-md border border-line"
              >
                {/* Repliée, une carte tient sur une ligne. */}
                <div className="flex items-stretch">
                  <button
                    type="button"
                    onClick={() => setOuvert(estOuvert ? null : l.id)}
                    aria-expanded={estOuvert}
                    className="flex min-h-[52px] flex-1 items-center gap-2 px-3 text-left transition-colors hover:bg-surface-2"
                  >
                    <ChevronDown
                      className={`h-4 w-4 flex-none text-ink-3 transition-transform ${estOuvert ? "rotate-180" : ""}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-semibold text-ink">
                        {nomEffectif(l) || `Lot ${i + 1}`}
                      </span>
                      <span className="block font-mono text-xs font-medium text-ink-3">
                        {ligne
                          ? `${prefixeEffectif(l)} · ${ligne.nb} pièce${ligne.nb > 1 ? "s" : ""} · ${euros(ligne.somme)}`
                          : `${prefixeEffectif(l)} · à compléter`}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setLots((ls) =>
                        ls.length > 1 ? ls.filter((x) => x.id !== l.id) : ls,
                      )
                    }
                    disabled={lots.length === 1}
                    aria-label={`Supprimer le lot ${i + 1}`}
                    className="flex w-12 flex-none items-center justify-center text-ink-3 transition-colors hover:bg-surface-2 hover:text-neg disabled:opacity-30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {estOuvert && (
                  // Un champ par ligne sur mobile : quatre champs côte à côte à
                  // 390 px tronquaient « Sac à dos » en « sac a c ».
                  <div className="space-y-3 border-t border-line bg-surface-2 p-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className={label} htmlFor={`marque-${l.id}`}>
                          Marque
                        </label>
                        <input
                          id={`marque-${l.id}`}
                          list={`marques-${l.id}`}
                          value={l.marque}
                          onChange={(e) =>
                            majLot(l.id, { marque: e.target.value })
                          }
                          placeholder="Nike"
                          className={field}
                        />
                        <datalist id={`marques-${l.id}`}>
                          {MARQUES.map((m) => (
                            <option key={m} value={m} />
                          ))}
                        </datalist>
                      </div>
                      <div>
                        <label className={label} htmlFor={`categorie-${l.id}`}>
                          Catégorie
                        </label>
                        <input
                          id={`categorie-${l.id}`}
                          value={l.categorie}
                          onChange={(e) =>
                            majLot(l.id, { categorie: e.target.value })
                          }
                          placeholder="Sac à dos"
                          className={field}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className={label} htmlFor={`nom-${l.id}`}>
                          Nom du lot
                        </label>
                        <input
                          id={`nom-${l.id}`}
                          value={l.nom}
                          onChange={(e) =>
                            majLot(l.id, { nom: e.target.value })
                          }
                          placeholder={libelleLot(l.marque, l.categorie)}
                          className={field}
                        />
                      </div>
                      <div>
                        <label className={label} htmlFor={`prefixe-${l.id}`}>
                          Préfixe SKU
                        </label>
                        <input
                          id={`prefixe-${l.id}`}
                          value={l.prefixe}
                          onChange={(e) =>
                            majLot(l.id, {
                              prefixe: normaliserPrefixe(e.target.value),
                            })
                          }
                          placeholder={skuPrefix(l.marque, l.categorie.trim())}
                          className={`${field} font-mono`}
                        />
                      </div>
                    </div>

                    {/* Le mode de saisie appartient au LOT : une commande peut
                        mêler un lot au forfait et un lot pièce par pièce. */}
                    <div
                      role="radiogroup"
                      aria-label={`Mode de saisie du lot ${i + 1}`}
                      className="grid grid-cols-2 gap-1 rounded-md bg-surface p-1"
                    >
                      {(
                        [
                          ["LOT", "Au lot", "Un prix pour l'ensemble"],
                          ["PIECE", "Pièce par pièce", "Un prix par article"],
                        ] as const
                      ).map(([v, titre, aide]) => (
                        <button
                          key={v}
                          type="button"
                          role="radio"
                          aria-checked={l.mode === v}
                          onClick={() => majLot(l.id, { mode: v })}
                          className={`min-h-11 rounded-md px-3 py-1.5 text-left transition-colors ${
                            l.mode === v
                              ? "bg-surface-2"
                              : "text-ink-2 hover:bg-surface-2/60"
                          }`}
                        >
                          <span className="block text-base font-semibold">
                            {titre}
                          </span>
                          <span className="block text-xs font-medium text-ink-3">
                            {aide}
                          </span>
                        </button>
                      ))}
                    </div>

                    {l.mode === "LOT" ? (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className={label} htmlFor={`qte-${l.id}`}>
                            Nombre de pièces
                          </label>
                          <input
                            id={`qte-${l.id}`}
                            type="number"
                            min="1"
                            step="1"
                            value={l.quantite}
                            onChange={(e) =>
                              majLot(l.id, { quantite: e.target.value })
                            }
                            placeholder="50"
                            className={field}
                          />
                        </div>
                        <div>
                          <label className={label} htmlFor={`prix-${l.id}`}>
                            Prix du lot (€)
                          </label>
                          <input
                            id={`prix-${l.id}`}
                            type="number"
                            step="any"
                            min="0"
                            value={l.prixTotal}
                            onChange={(e) =>
                              majLot(l.id, { prixTotal: e.target.value })
                            }
                            placeholder="250"
                            className={field}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {l.pieces.map((p, j) => (
                          <div key={p.id} className="flex items-center gap-2">
                            <span className="w-7 flex-none text-right font-mono text-xs font-medium text-ink-3">
                              {j + 1}.
                            </span>
                            <input
                              aria-label={`Prix de la pièce ${j + 1} du lot ${i + 1}`}
                              type="number"
                              step="any"
                              min="0"
                              value={p.prix}
                              onChange={(e) =>
                                majLot(l.id, {
                                  pieces: l.pieces.map((x) =>
                                    x.id === p.id
                                      ? { ...x, prix: e.target.value }
                                      : x,
                                  ),
                                })
                              }
                              placeholder="Prix €"
                              className={`${field} flex-1 text-right font-mono`}
                            />
                            <button
                              type="button"
                              onClick={() =>
                                majLot(l.id, {
                                  pieces:
                                    l.pieces.length > 1
                                      ? l.pieces.filter((x) => x.id !== p.id)
                                      : l.pieces,
                                })
                              }
                              disabled={l.pieces.length === 1}
                              aria-label={`Supprimer la pièce ${j + 1}`}
                              className="flex h-11 w-11 flex-none items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-surface-2 hover:text-neg disabled:opacity-30"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() =>
                            majLot(l.id, {
                              pieces: [
                                ...l.pieces,
                                { id: ++compteur, prix: "" },
                              ],
                            })
                          }
                          className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-line text-base font-medium text-ink-2 transition-colors hover:border-accent hover:text-accent-text"
                        >
                          <Plus className="h-4 w-4" />
                          Ajouter une pièce
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => {
              const l = nouveauLot();
              setLots((ls) => [...ls, l]);
              setOuvert(l.id);
            }}
            className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-line text-base font-medium text-ink-2 transition-colors hover:border-accent hover:text-accent-text"
          >
            <Plus className="h-4 w-4" />
            Ajouter un lot
          </button>
        </fieldset>

        {/* Récapitulatif : le garde-fou de saisie. Le coût total n'est pas un
            champ, il découle des lots — impossible de le contredire. */}
        <div className="rounded-md border border-line bg-surface-2 px-3 py-2.5 text-base">
          {apercu ? (
            <dl className="space-y-1">
              {apercu.lignes.map((ligne) => (
                <div key={ligne.id} className="flex justify-between gap-3">
                  <dt className="min-w-0 truncate text-ink-2">
                    {ligne.nom}{" "}
                    <span className="text-ink-3">× {ligne.nb}</span>
                  </dt>
                  <dd className="flex-none font-mono">{euros(ligne.somme)}</dd>
                </div>
              ))}
              <div className="flex justify-between">
                <dt className="text-ink-2">Frais de livraison</dt>
                <dd className="font-mono">{euros(apercu.frais)}</dd>
              </div>
              <div className="flex justify-between border-t border-line pt-1 font-semibold">
                <dt>Total de la commande</dt>
                <dd className="font-mono text-accent-text">
                  {euros(apercu.total)}
                </dd>
              </div>
            </dl>
          ) : (
            <span className="text-ink-3">
              Complète les lots pour voir le total.
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="grade">
              Grade
            </label>
            <input
              id="grade"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              placeholder="(optionnel)"
              className={field}
            />
          </div>
          <div>
            <label className={label} htmlFor="coef">
              Objectif coef (x)
            </label>
            <input
              id="coef"
              type="number"
              step="0.1"
              min="0"
              value={coefObjectif}
              onChange={(e) => setCoefObjectif(e.target.value)}
              placeholder="2.5"
              className={field}
            />
          </div>
        </div>

        <p className="text-xs font-medium text-ink-3">
          {/* Pas d'exemple numéroté : les SKU ne repartent pas de 1, ils
              continuent la série existante de chaque préfixe. */}
          Série{lots.length > 1 ? "s" : ""} :{" "}
          {[...new Set(lots.map(prefixeEffectif))].join(", ")}. Un compteur par
          préfixe, qui reprend après le dernier SKU existant.
        </p>

        {create.isError && (
          <p role="alert" className="text-base text-neg">
            {(create.error as Error).message}
          </p>
        )}
      </form>
    </Modal>
  );
}
