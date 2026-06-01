/**
 * Diagnostic LECTURE SEULE : récupère le workflow chatbot live et inspecte
 * l'encodage réel des chaînes accentuées (system message + condition sans_reponse_kb).
 * Ne modifie rien. Usage : node scripts/inspect-encoding.mjs
 */
import { loadN8nMcpEnv } from './n8n-env.mjs';

const WORKFLOW_ID = 'PNc_3uhUfWJosTQi4qWtW';
const { N8N_BASE_URL, N8N_API_KEY } = loadN8nMcpEnv();

const res = await fetch(`${N8N_BASE_URL.replace(/\/$/, '')}/api/v1/workflows/${WORKFLOW_ID}`, {
  headers: { 'X-N8N-API-KEY': N8N_API_KEY },
});
console.log('Content-Type:', res.headers.get('content-type'));
const buf = Buffer.from(await res.arrayBuffer());
const text = buf.toString('utf8');
const w = JSON.parse(text);

// 1) Le nœud d'insert actif et sa condition sans_reponse_kb
const insert = w.nodes.find((n) => n.id === '22ccb520-2b9b-48e5-b91c-a9137f07e645');
const cond = insert?.parameters?.columns?.value?.sans_reponse_kb ?? '(introuvable)';
console.log('\n=== sans_reponse_kb (Insert rows in a table) ===');
console.log('Brut   :', cond);
console.log('Échappé:', JSON.stringify(cond)); // montre é (é propre) ou � / Ã (mojibake)

// 2) Échantillon du system message de l'AI Agent (autour de "Rôle")
const agent = w.nodes.find((n) => n.id === 'b0912041-493b-48c2-a3e2-3e5ba697c8b8');
const sys = agent?.parameters?.options?.systemMessage ?? '';
const sample = sys.slice(0, 30);
console.log('\n=== system message (30 premiers car.) ===');
console.log('Brut   :', sample);
console.log('Échappé:', JSON.stringify(sample));

// 3) Verdict encodage : cherche des marqueurs de mojibake
const hasReplacement = /�/.test(sys);
const hasDoubleEnc = /Ã[ -¿]/.test(sys); // ex: Ã© = é double-encodé
console.log('\n=== Verdict ===');
console.log('Contient U+FFFD (�) :', hasReplacement);
console.log('Contient double-encodage (Ã…) :', hasDoubleEnc);
console.log('Taille workflow (octets):', buf.length);
