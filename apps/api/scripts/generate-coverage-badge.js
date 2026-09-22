#!/usr/bin/env node
/**
 * Génère un badge SVG de couverture de tests, sans service tiers payant (demande explicite : pas
 * de Codecov) — lit le pourcentage réel produit par `jest --coverage` (coverage/coverage-summary.json,
 * jamais une valeur inventée) et télécharge l'image correspondante depuis shields.io (simple générateur
 * d'image, gratuit, sans compte — pas un service de suivi comme Codecov). Écrit le fichier dans le dépôt
 * (docs/badges/coverage.svg), que la CI committe ensuite si le pourcentage a changé.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const summaryPath = path.join(__dirname, '..', 'coverage', 'coverage-summary.json');
const outputPath = path.join(__dirname, '..', '..', '..', 'docs', 'badges', 'coverage.svg');

if (!fs.existsSync(summaryPath)) {
  console.error(`Résumé de couverture introuvable : ${summaryPath} (lancer jest --coverage d'abord).`);
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
const pct = summary.total.lines.pct;
if (typeof pct !== 'number' || Number.isNaN(pct)) {
  console.error('Pourcentage de couverture illisible dans coverage-summary.json.');
  process.exit(1);
}

// Mêmes seuils de couleur que la convention shields.io/istanbul-badges-readme habituelle.
function colorFor(value) {
  if (value >= 90) return 'brightgreen';
  if (value >= 80) return 'green';
  if (value >= 70) return 'yellowgreen';
  if (value >= 60) return 'yellow';
  if (value >= 50) return 'orange';
  return 'red';
}

const rounded = Math.round(pct * 10) / 10;
const label = 'coverage';
const value = `${rounded}%25`; // %25 = signe pourcent encodé pour l'URL
const color = colorFor(rounded);
const url = `https://img.shields.io/badge/${label}-${value}-${color}.svg`;

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
      console.log(`Badge de couverture généré (${rounded}%, ${color}) : ${outputPath}`);
    });
  })
  .on('error', (err) => {
    console.error('Échec du téléchargement du badge shields.io :', err.message);
    process.exit(1);
  });
