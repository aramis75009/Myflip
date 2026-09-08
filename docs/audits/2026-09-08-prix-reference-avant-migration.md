# Prix de référence, relevés avant leur suppression

Généré par `scripts/exporter-prix-reference.ts` le 2026-09-08 sur la base
**dev**, juste avant la migration `20260908120000_prix_dans_prompt_delai_par_lot`,
qui détruit la table `PrixReference`.

Le report vers `PromptTemplate.prixReference` est **manuel** : plusieurs
prompts peuvent correspondre à un même prix, la migration ne peut pas
choisir. Cette page est la seule trace qui reste de ces valeurs.

0 ligne(s).

| Compte | Marque | Catégorie | Prix (€) | Défaut |
|---|---|---|---|---|
