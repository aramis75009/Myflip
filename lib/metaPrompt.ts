// Méta-prompt : le texte à donner à un LLM externe pour qu'il rédige un prompt
// d'annonce compatible avec MyFlip.
//
// ⚠️ Ce texte décrit un CONTRAT TECHNIQUE réel. S'il diverge de ce que
// l'application attend, il produit des prompts qui échouent en production :
//   • les variables sont celles de `compilePrompt` (lib/promptSelect.ts) ;
//   • le format de sortie est imposé par le `response_format` de lib/openrouter.ts
//     et de lib/ollama.ts (qui le redit aussi à la suite du prompt) ;
//   • la génération est multimodale — les photos accompagnent le prompt
//     (app/api/listings/generate/route.ts refuse une requête sans image).
// Toute modification de l'un de ces trois points doit être répercutée ici.

export type CibleMetaPrompt = {
  marque?: string | null;
  categorie?: string | null;
};

/**
 * Construit le méta-prompt, éventuellement ciblé sur une marque et une
 * catégorie. Sans cible, il produit un prompt polyvalent.
 */
export function metaPrompt(cible: CibleMetaPrompt = {}): string {
  const marque = cible.marque?.trim();
  const categorie = cible.categorie?.trim();

  const visee =
    marque || categorie
      ? `Ce modèle servira spécifiquement pour : ${[categorie, marque].filter(Boolean).join(" ")}. Écris-le pour ce cas précis, pas de façon générique.`
      : `Ce modèle servira de repli pour tous les articles, toutes marques et catégories confondues. Reste applicable à n'importe quel vêtement d'occasion.`;

  return `Tu vas rédiger un MODÈLE DE PROMPT destiné à une application de revente
de vêtements d'occasion appelée MyFlip. Ce modèle sera envoyé tel quel à un
modèle multimodal, accompagné des photos d'un article, pour produire une
annonce Vinted.

${visee}

CONTRAINTES ABSOLUES — un modèle qui les enfreint casse l'application.

1. Variables disponibles. Le modèle peut contenir ces marqueurs, remplacés par
   l'application avant l'envoi. N'en invente aucun autre : tout marqueur inconnu
   resterait tel quel dans le prompt envoyé au modèle.
     {marque}     la marque de l'article
     {categorie}  le type d'article (Polo, Pull, Short…)
     {taille}     la taille
     {etat}       l'état déclaré
     {matiere}    la matière
     {sku}        la référence interne
     {details}    les précisions libres saisies au moment de la génération
   Ces valeurs peuvent être vides : le modèle doit rester lisible sans elles.

2. Les PHOTOS accompagnent le prompt. C'est la source principale : le modèle
   doit demander explicitement d'observer les photos (coupe, défauts, couleur
   réelle, logo, étiquette) plutôt que de broder à partir des seules variables.

3. Format de sortie, imposé et non négociable. La réponse doit être un objet
   JSON valide comportant EXACTEMENT ces trois clés, toutes des chaînes :
     "titre"        le titre de l'annonce
     "description"  le corps de l'annonce
     "motsCles"     les mots-clés, séparés par des virgules
   Aucune clé supplémentaire, aucun texte avant ou après, aucune balise de code
   markdown. Le modèle de prompt doit le dire explicitement.

4. Exigences de contenu attendues par le vendeur :
   • le titre doit saturer 100 caractères sans jamais les dépasser ;
   • environ 80 mots-clés, répartis sur 7 langues européennes, sans aucun
     doublon ni traduction redondante ;
   • la description doit être honnête : mentionner les défauts visibles sur les
     photos, ne jamais inventer une matière ou une mesure absente.

MANIÈRE DE RÉPONDRE.
Réponds UNIQUEMENT avec le texte du modèle de prompt, prêt à être collé dans
MyFlip. Pas d'introduction, pas d'explication, pas de balise de code autour.`;
}
