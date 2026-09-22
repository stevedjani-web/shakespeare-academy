#!/usr/bin/env node
/**
 * Calcule la taille moyenne réelle des commits (lignes ajoutées + supprimées, moyenne sur tout
 * l'historique de master) et génère un badge SVG via shields.io. Aucun badge natif shields.io n'existe
 * pour ça (github/avg-commit-size répond « 404 : badge not found » — vérifié avant de coder).
 * `git log --shortstat` fait autorité, jamais un chiffre inventé. Uniquement sur push : n'importe quel
 * nouveau commit change cette moyenne, même patron que les badges de nombre de commits et de fichiers.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const root = path.join(__dirname, '..');
const output = execSync('git log --shortstat --pretty=tformat:__COMMIT__', {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 1024 * 1024 * 64,
});

let commitCount = 0;
let totalChangedLines = 0;
for (const line of output.split('\n')) {
  if (line === '__COMMIT__') {
    commitCount += 1;
    continue;
  }
  const insertions = line.match(/(\d+) insertions?\(\+\)/);
  const deletions = line.match(/(\d+) deletions?\(-\)/);
  if (insertions) totalChangedLines += parseInt(insertions[1], 10);
  if (deletions) totalChangedLines += parseInt(deletions[1], 10);
}

if (commitCount === 0) {
  console.error('Aucun commit trouvé — refus de générer un badge (probablement une erreur).');
  process.exit(1);
}

const average = Math.round(totalChangedLines / commitCount);
const url = `https://img.shields.io/badge/avg%20commit%20size-${average}%20lines-9cf.svg`;
const outputPath = path.join(root, 'docs', 'badges', 'avg-commit-size.svg');

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
        `Badge de taille moyenne des commits généré (${totalChangedLines} lignes changées sur ${commitCount} commits, moyenne ${average}) : ${outputPath}`,
      );
    });
  })
  .on('error', (err) => {
    console.error('Échec du téléchargement du badge shields.io :', err.message);
    process.exit(1);
  });
