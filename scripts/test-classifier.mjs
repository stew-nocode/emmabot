/**
 * Test LOCAL (sans toucher au bot live) de la logique sans_reponse_kb poussée.
 * Reproduit exactement la normalisation + le matching de la nouvelle expression.
 */
const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ');
const SIGNAUX = ['necessite l avis', 'transmis immediatement', 'transmise en priorite', 'ne concerne pas', 'la base ne contient pas', 'je n ai pas cette information', 'je transmets'];
const sansReponse = (out) => SIGNAUX.some((p) => norm(out).includes(p));

const CAS = [
  ['Escalade "nécessite l\'avis"', "C'est une excellente question qui nécessite l'avis d'un de nos experts. J'ai donc transmis immédiatement votre demande à l'équipe support, qui a toutes les informations pour vous répondre par email.", true],
  ['Escalade frustration', "Je comprends votre frustration ; votre demande a été officiellement enregistrée et transmise en priorité à notre support. Un expert va l'examiner et vous répondre par email.", true],
  ['Hors-sujet', "Cette question ne concerne pas OBC. Je suis uniquement en mesure de vous assister sur les fonctionnalités de cette application.", true],
  ['Lacune KB', "La base ne contient pas de procédure spécifique pour créer un projet dans OBC. Souhaitez-vous que je transmette ?", true],
  ['Escalade variante propre', "Je n'ai pas cette information dans ma base de connaissance. Je transmets immédiatement votre préoccupation au support.", true],
  ['Clarification (NE doit PAS flagger)', "Je suis désolé(e). Pouvez-vous me décrire précisément le problème que vous rencontrez ?", false],
  ['Vraie réponse KB (NE doit PAS flagger)', "Pour imprimer le grand livre comptable dans OBC, voici les indications : - Allez dans le module Finance...", false],
  ['Vraie réponse paie (NE doit PAS flagger)', "Le processus de calcul de paie dans OBC est le même quel que soit le contexte, y compris pour une paie liée à la FNE.", false],
];

let ok = 0;
for (const [label, out, attendu] of CAS) {
  const got = sansReponse(out);
  const verdict = got === attendu ? 'OK  ' : 'ÉCHEC';
  if (got === attendu) ok++;
  console.log(`${verdict} | sans_reponse=${got} (attendu ${attendu}) | ${label}`);
}
console.log(`\n${ok}/${CAS.length} cas corrects.`);
