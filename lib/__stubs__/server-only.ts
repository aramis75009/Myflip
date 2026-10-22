// Doublure de test pour le paquet marqueur `server-only`.
//
// Le vrai paquet lève « This module cannot be imported from a Client Component
// module » dès qu'il est importé hors d'un Server Component — et Vitest tourne
// en Node nu, donc tout module serveur qui l'importe ferait échouer son test au
// chargement, avant la première assertion.
//
// Branché par l'alias de `vitest.config.ts`. Ne rien exporter : le paquet
// d'origine n'exporte rien non plus, il ne sert qu'à marquer la frontière.
export {};
