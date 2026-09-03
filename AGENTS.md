# MyFlip — contrat commun à tous les agents

SaaS de gestion pour la revente de vêtements sur Vinted : stock, chiffrage,
génération d'annonces IA, mise en vente, intégration Trello. Next 15 / React
18, Prisma + Neon Postgres, déployé sur Vercel.

**Ce fichier est lu par tous les agents qui travaillent sur ce dépôt** (Claude
Code, Codex, ou autre). C'est le seul commun aux trois. `CLAUDE.md` garde ce
qui est spécifique à Claude (règles de design mobile, historique détaillé) ;
une règle qui doit s'appliquer à tout le monde vit ici, pas là-bas.

| Fichier | Quand le lire |
|---|---|
| **`HANDOFF.md`** | **Toujours, en premier.** Où en est le projet, maintenant. |
| `AGENTS.md` | Ce fichier. Les règles qui ne changent pas. |
| `CLAUDE.md` | Spécifique à Claude Code : design system, architecture détaillée. |
| `TODOS.md` | Ce qui est différé — ne pas redécouvrir un chantier connu. |
| `README.md` | Fonctionnement, déploiement, configuration. |
| `docs/handoffs/` | Les passations passées, à la demande. |

---

## Commence par lire HANDOFF.md

Il contient une seule passation : la dernière. Elle dit l'objectif en cours,
ce qui a été validé, ce qui bloque et la prochaine action.

**Ne recommence pas un travail décrit comme fait. Ne re-débats pas une
décision inscrite dans sa section `Decisions`.**

---

## Invariants — les casser produit des bugs silencieux

**Aucun de ces points ne lève d'erreur quand on le viole.** C'est pour ça
qu'ils sont écrits.

- **Ne jamais lancer `npm run build` si `npm run dev` tourne déjà** : ça
  corrompt `.next` sans message clair. Utiliser `npm run typecheck` puis
  vérifier dans le navigateur.
- **La colonne `Article.photosPretes` existe en base mais pas dans
  `prisma/schema.prisma`**, et n'est lue nulle part dans le code (le suivi
  passe par le statut « Photos prêtes »). L'utilisateur a demandé
  explicitement de la conserver — `prisma db push` proposera de la dropper à
  chaque changement de schéma : refuser, faire un `ALTER TABLE` ciblé si
  besoin. Même consigne pour `UserSettings.geminiKey` et `.anthropicKey`
  (colonnes mortes depuis le passage à OpenRouter, mais conservées).
- **`ENCRYPTION_KEY` perdue = tous les secrets de `UserSettings` illisibles**
  (chiffrement AES-256-GCM). La sauvegarder hors Vercel. La changer invalide
  l'existant.
- **Trello n'a plus de repli sur variables d'environnement** — l'accès passe
  uniquement par l'OAuth 1.0a de chaque compte (`/api/trello/connect`). Ne
  jamais réintroduire un repli env « pour faire marcher un compte neuf » :
  c'est exactement le trou de sécurité qui a été corrigé (un compte neuf
  empruntait le board du propriétaire du déploiement).
- **Alias de couleur Tailwind → toujours une variable CSS, jamais un hex.**
  `primary`/`error`/etc. suivent `--acc`/`--neg` et donc le thème clair/sombre.
  Un hex en dur passe la revue en clair et casse le sombre sans bruit.
  Corollaire : pas de modificateur d'opacité Tailwind sur une variable CSS
  (`ring-primary/15` ne produit rien) — utiliser les tokens dédiés
  `--acc-ring`/`--acc-ring-strong`.
- **`/mise-en-vente` est desktop-only, sans export ZIP** — décidé à l'oral le
  11/08/2026, **pas encore répercuté dans `CLAUDE.md`**, qui décrit encore le
  mobile-first comme actif pour cette page. Ne pas « corriger » l'absence de
  responsive sur cet écran comme si c'était un bug.
- **Les photos de `/mise-en-vente` ne vivent qu'en mémoire du navigateur**
  (`Blob`, jamais uploadées sur un serveur — cf. `app/mise-en-vente/_reducer.ts`,
  type `Photo`). Toute fonctionnalité qui doit les récupérer doit le faire
  pendant que l'onglet est ouvert, pas après coup via une API.

---

## Vérifier avant d'affirmer

**Ne jamais écrire « c'est corrigé » sans avoir lancé la commande qui le
prouve et montré sa sortie.** Distinguer explicitement ce qui est *vérifié*
de ce qui est *supposé*.

```bash
npm run test        # vitest run
npm run typecheck   # tsc --noEmit
npm run lint        # next lint
```

---

## Git

- Ne jamais commiter directement sur `main` — brancher d'abord.
- Ne pas commiter ni pousser sans demande explicite.
- Lister tous les remotes avant de pousser (`git remote -v`).
- Messages de commit en anglais.
- Signer son travail : si plusieurs agents commitent sous la même identité
  git, la ligne **Agent** de la passation (`HANDOFF.md`) est la seule
  attribution qui existe.

---

## Terminer une session — la passation

**Une session n'est pas finie tant que la passation n'est pas écrite.** Ça
vaut pour dix minutes comme pour une journée.

1. **Archiver la passation en place** — déplacer le contenu de `HANDOFF.md`
   vers `docs/handoffs/AAAA-MM-JJ-sujet-court.md`. Ne jamais l'écraser.
2. **Écrire la nouvelle** dans `HANDOFF.md`, avec les sept sections.
3. **Ajouter une ligne** au tableau « Historique des passations », en haut de
   `HANDOFF.md`.
4. **Reporter dans `TODOS.md`** ce qui est différé — `HANDOFF.md` dit *où on
   en est*, `TODOS.md` dit *ce qu'on n'a pas fait*.

### Le gabarit

```markdown
# Passation — AAAA-MM-JJ · <sujet en cinq mots>

| | |
|---|---|
| **Agent** | <agent + modèle> |
| **Branche** | <branche> |
| **Commits** | <sha courts> |

## Goal — l'objectif
Une phrase. Ce que la session cherchait à obtenir.

## Current state — ce qui a été fait
Ce qui marche. **Et ce qui n'a pas été fait alors qu'on croyait le faire.**

## Decisions — choix critiques ou irréversibles
Chaque décision avec son POURQUOI. Sans le pourquoi, la prochaine session la
re-débat. Ne rien mettre ici qui ne soit ni critique ni irréversible.

## Changed — fichiers et composants
Tableau fichier → nature du changement. Les chemins exacts.

## Validations — passants / échoués / non lancés
**Trois états, pas deux.** « Non lancé » est l'information la plus utile de
la passation : elle dit où regarder en premier quand ça casse. Coller la
sortie réelle des commandes, pas un résumé.

## Blockers — ce qui bloque
Ce qui empêche d'avancer, et ce qu'il faudrait pour débloquer. Écrire
« rien » si rien ne bloque — une section vide se lit comme un oubli.

## Next — la prochaine action
Concrète et immédiate. Pas « améliorer l'UX » mais « relire la branche X ».
```
