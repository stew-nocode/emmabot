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
 * Un seul fichier échappe à la règle 2 : `loader.js`, déposé à la racine de `emma/`. C'est le
 * point d'entrée que l'intégrateur pose une fois pour toutes ; il lit `versions.json` et charge
 * la version courante. Sa version de repli est injectée ici, à la publication, pour qu'elle ne
 * puisse pas vieillir en silence derrière la version réellement en ligne.
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

// Repère de version, lu par `loader.js` à chaque chargement et par la sonde de version.
await writeFile(
  join(SORTIE, 'emma', 'versions.json'),
  JSON.stringify({ courante: version, publieLe: new Date().toISOString() }, null, 2)
);

// ── Le chargeur, avec sa version de repli ──
// Le remplacement est VÉRIFIÉ : un loader publié avec le marqueur intact chargerait une version
// inexistante dès que `versions.json` devient injoignable, soit exactement la panne qu'il est
// censé absorber. Mieux vaut interrompre la publication que livrer ce repli-là.
const MARQUEUR_REPLI = '@@VERSION_DE_REPLI@@';
const loaderSource = await readFile(join(RACINE, 'loader.js'), 'utf8');
if (!loaderSource.includes(MARQUEUR_REPLI)) {
  console.error(`${MARQUEUR_REPLI} introuvable dans loader.js — publication interrompue.`);
  process.exit(1);
}
await writeFile(
  join(SORTIE, 'emma', 'loader.js'),
  loaderSource.split(MARQUEUR_REPLI).join(version)
);

console.log(`Publication préparée : /emma/${version}/`);
A_PUBLIER.forEach((f) => console.log(`  - ${f}`));
console.log('  - emma/versions.json');
console.log(`  - emma/loader.js (repli : ${version})`);
