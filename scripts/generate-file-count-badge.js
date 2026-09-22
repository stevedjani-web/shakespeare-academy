#!/usr/bin/env node
/**
 * Compte le nombre réel de fichiers suivis par git dans tout le dépôt et génère un badge SVG via
 * shields.io. Le badge natif shields.io/github/directory-file-count ne compte que les éléments de la
 * racine (12 ici : .github, apps, docs...), jamais le vrai total du projet — vérifié avant de choisir
 * cette approche. `git ls-files` fait autorité, jamais un chiffre inventé. Contrairement aux badges de
 * couverture, dépendances obsolètes et vulnérabilités, ce nombre ne change jamais sans un commit : pas
 * besoin d'un calendrier, seulement un déclenchement sur push.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const root = path.join(__dirname, '..');
const out = execSync('git ls-files', { cwd: root, encoding: 'utf8' });
const count = out.split('\n').filter((line) => line.trim().length > 0).length;

if (count === 0) {
  console.error('Aucun fichier suivi trouvé — refus de générer un badge à 0 (probablement une erreur).');
  process.exit(1);
}

const url = `https://img.shields.io/badge/files-${count}-informational.svg`;
const outputPath = path.join(root, 'docs', 'badges', 'file-count.svg');

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
      console.log(`Badge de nombre de fichiers généré (${count} fichiers suivis par git) : ${outputPath}`);
    });
  })
  .on('error', (err) => {
    console.error('Échec du téléchargement du badge shields.io :', err.message);
    process.exit(1);
  });
