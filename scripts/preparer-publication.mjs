/**
 * Prépare le dossier publié par Vercel.
 *
 * ## Deux règles, et elles sont volontaires
 *
 * 1. **On ne publie QUE le widget et ses ressources.** Pas la page de démo, pas le snippet, pas
 *    les instantanés n8n, pas les scripts. Le 14/09/2026, un secret du chat s'est retrouvé en
 *    ligne précisément parce que GitHub Pages publiait le dépôt entier (commit `ab58d93`).
 *    Ici, rien n'est publié qui n'ait été copié explicitement ci-dessous.
 *
 * 2. **Une adresse par version, jamais réécrite.** Le fichier est déposé dans `emma/<version>/`,
 *    d'où le numéro lu dans la source et non saisi à la main. Pas de `latest` : une adresse qui
 *    change sous les pieds de l'intégrateur est exactement ce qu'on cherche à supprimer.
 *
 * Lancé automatiquement par Vercel (cf. `vercel.json`), ou à la main pour vérifier :
 *   node scripts/preparer-publication.mjs
 */

import { readFile, mkdir, copyFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SORTIE = join(RACINE, 'public');

/** Ce qui part en ligne. Toute addition ici est une décision de publication. */
const A_PUBLIER = ['emma-widget.js', 'emma-avatar.png'];

const source = await readFile(join(RACINE, 'emma-widget.js'), 'utf8');
const version = (/EMMA_WIDGET_VERSION\s*=\s*['"]([^'"]+)['"]/.exec(source) || [])[1];
if (!version) {
  console.error('EMMA_WIDGET_VERSION introuvable dans emma-widget.js — publication interrompue.');
  process.exit(1);
}

const dossier = join(SORTIE, 'emma', version);
await rm(SORTIE, { recursive: true, force: true });
await mkdir(dossier, { recursive: true });

for (const fichier of A_PUBLIER) {
  await copyFile(join(RACINE, fichier), join(dossier, fichier));
}

// Repère de version, pratique pour une sonde ou un contrôle à la main.
await writeFile(
  join(SORTIE, 'emma', 'versions.json'),
  JSON.stringify({ courante: version, publieLe: new Date().toISOString() }, null, 2)
);

console.log(`Publication préparée : /emma/${version}/`);
A_PUBLIER.forEach((f) => console.log(`  - ${f}`));
