#!/usr/bin/env node
/**
 * Compte les dépendances obsolètes (apps/api + apps/web) et génère un badge SVG via shields.io.
 * Aucun service tiers de suivi de dépendances : David-DM a fermé fin 2021 (badge shields.io « 404 : badge
 * not found », vérifié avant de coder), Libraries.io répond « repo not found » pour ce dépôt — les deux
 * options gratuites classiques ne fonctionnent plus. `npm outdated` fait autorité, jamais un chiffre inventé.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

/** npm outdated sort avec le code 1 dès qu'au moins un paquet est obsolète — jamais une vraie erreur. */
function countOutdated(dir) {
  let out;
  try {
    out = execSync('npm outdated --json', { cwd: dir, encoding: 'utf8' });
  } catch (err) {
    out = err.stdout ? err.stdout.toString() : '';
  }
  try {
    return Object.keys(JSON.parse(out || '{}')).length;
  } catch (parseErr) {
    console.error(`Sortie de npm outdated illisible pour ${dir} :`, parseErr.message);
    process.exit(1);
  }
}

const root = path.join(__dirname, '..');
const apiCount = countOutdated(path.join(root, 'apps', 'api'));
const webCount = countOutdated(path.join(root, 'apps', 'web'));
const total = apiCount + webCount;

function colorFor(count) {
  if (count === 0) return 'brightgreen';
  if (count <= 5) return 'yellowgreen';
  if (count <= 15) return 'yellow';
  if (count <= 30) return 'orange';
  return 'red';
}

const value = total === 0 ? 'up%20to%20date' : `${total}%20outdated`;
const url = `https://img.shields.io/badge/dependencies-${value}-${colorFor(total)}.svg`;
const outputPath = path.join(root, 'docs', 'badges', 'outdated.svg');

https
  .get(url, (res) => {
    if (res.statusCode !== 200) {
      console.error(`shields.io a répondu ${res.statusCode} pour ${url}`);
      process.exit(1);
    }
    let data = '';
    res.setEncoding('utf8');
    res.on('data', (chunk) => (data += chunk));
    res.on('end', () => {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, data);
      console.log(
        `Badge de dépendances obsolètes généré (api : ${apiCount}, web : ${webCount}, total : ${total}) : ${outputPath}`,
      );
    });
  })
  .on('error', (err) => {
    console.error('Échec du téléchargement du badge shields.io :', err.message);
    process.exit(1);
  });
