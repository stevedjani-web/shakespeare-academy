#!/usr/bin/env node
/**
 * Compte le nombre réel de commits sur master et génère un badge SVG via shields.io. Aucun badge natif
 * shields.io n'existe pour ça (github/commit-count répond « 404 : badge not found » — vérifié avant de
 * coder). `git rev-list --count HEAD` fait autorité, jamais un chiffre inventé. Uniquement sur push : ce
 * nombre ne change jamais sans un commit, même patron que les badges de nombre de fichiers et de lignes
 * de code.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const root = path.join(__dirname, '..');
const count = parseInt(execSync('git rev-list --count HEAD', { cwd: root, encoding: 'utf8' }).trim(), 10);

if (!Number.isInteger(count) || count <= 0) {
  console.error('Nombre de commits illisible — refus de générer un badge (probablement une erreur).');
  process.exit(1);
}

const url = `https://img.shields.io/badge/commits-${count}-blue.svg`;
const outputPath = path.join(root, 'docs', 'badges', 'commit-count.svg');

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
      console.log(`Badge de nombre de commits généré (${count} commits sur master) : ${outputPath}`);
    });
  })
  .on('error', (err) => {
    console.error('Échec du téléchargement du badge shields.io :', err.message);
    process.exit(1);
  });
