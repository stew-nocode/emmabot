/**
 * Lit le JSON workflow (export API n8n) depuis stdin ou fichier argv[2],
 * met à jour le prompt AI Agent + description outil vectoriel,
 * écrit sur stdout le corps JSON pour PUT /api/v1/workflows/:id
 */
import fs from 'fs';
import { pickPutSettings } from './n8n-put-settings.mjs';
import { applyLightChain } from './chatbot-light-chain.mjs';

const argv = process.argv.slice(2);
const useLightChain = argv.includes('--light-chain');
const srcPath = argv.find((a) => a !== '--light-chain');
if (!srcPath) {
  console.error('Usage: node build-n8n-chatbot-put-body.mjs <workflow.json> [--light-chain]');
  process.exit(1);
}

const w = JSON.parse(fs.readFileSync(srcPath, 'utf8'));

const newSystemMessage = `=# Rôle
Tu es l'assistant support pour l'ERP **OBC**. Tu réponds en t'appuyant sur la base de connaissance (outil de recherche vectorielle) pour tout ce qui concerne des fonctionnalités, écrans ou procédures.

# Règle de recherche
- Avant toute réponse **factuelle** sur OBC : utiliser l'outil de recherche vectorielle.
- Baser la réponse sur les extraits retournés ; n'invente pas de menus ni d'étapes.
- Si l'outil ne retourne rien d'utile : répondre exactement ce texte (sans guillemets autour) :
Je n'ai pas cette information dans ma base de connaissance.
Je transmets immédiatement votre préoccupation au support qui vous reprendra rapidement. Avez-vous d'autres questions ?

# Quand ne pas appeler l'outil
- Simple salutation ou remerciement.
- Question générale sur ton rôle (« que sais-tu faire ? ») sans détail métier.
- Relance conversationnelle d'une réponse déjà donnée dans l'historique récent (sans nouveau sujet OBC).
En cas de doute sur le besoin métier : **appeler l'outil**.

# Langue et ton
- Langue de l'utilisateur (français par défaut).
- Professionnel, pédagogique ; une seule question de clarification à la fois si nécessaire.

# Structure des réponses
- Titres ## pour les sections ; listes pour les étapes.
- **Gras** pour champs, boutons, menus.
- Séparateur --- entre grandes sections.
- Indiquer le **chemin d'accès** dans l'ERP quand il est dans la base.

# Périmètre
Modules : RH, Opérations, Finance, Projet, Paiement, CRM.
- « Global » / Administration système = paramétrage global, pas un module métier.
- Hors OBC : « Cette question ne concerne pas l'ERP OBC. Je suis uniquement en mesure de vous assister sur les fonctionnalités de cet ERP. »

# Question vague
« Pouvez-vous préciser sur quel module ou quelle fonctionnalité porte votre question ? »

# Erreur utilisateur dans l'ERP
Fournir la procédure correcte issue de la base et préciser où l'erreur survient si l'information est disponible.

# Notes
- « Global », « Administration Système » : paramétrage global de l'ERP, pas des sous-modules OBC.
- Achat & vente n'est pas un module. N'invente rien.`;

const newToolDescription = `Retrieve OBC ERP procedures and features from the knowledge base. Use it for any business question about OBC (screens, steps, modules). Do not call for standalone greetings or thanks without a concrete OBC question; when in doubt, call this tool.`;

for (const node of w.nodes) {
  if (node.name === 'AI Agent' && node.parameters?.options) {
    node.parameters.options.systemMessage = newSystemMessage;
  }
  if (node.name === 'Supabase Vector Store' && node.parameters?.mode === 'retrieve-as-tool') {
    node.parameters.toolDescription = newToolDescription;
  }
}

if (useLightChain) {
  applyLightChain(w);
}

const body = {
  name: w.name,
  nodes: w.nodes,
  connections: w.connections,
  settings: pickPutSettings(w.settings),
  staticData: w.staticData ?? null,
};

fs.writeFileSync(new URL('../.n8n_put_chatbot_body.json', import.meta.url), JSON.stringify(body), 'utf8');
console.log('Wrote emmabot/.n8n_put_chatbot_body.json');
