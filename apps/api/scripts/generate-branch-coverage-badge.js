#!/usr/bin/env node
/**
 * Génère un badge SVG de couverture de BRANCHES (if/else, ternaires, ??, courts-circuits — distinct de
 * la couverture de lignes déjà affichée par le badge "Coverage"), depuis le même
 * coverage/coverage-summary.json produit par le job e2e-coverage (aucune suite relancée uniquement pour
 * ce badge). Même principe que generate-coverage-badge.js : pas de service tiers (Codecov écarté
 * explicitement), le pourcentage réel fait autorité, shields.io ne fait que dessiner l'image.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const summaryPath = path.join(__dirname, '..', 'coverage', 'coverage-summary.json');
const outputPath = path.join(__dirname, '..', '..', '..', 'docs', 'badges', 'branch-coverage.svg');

if (!fs.existsSync(summaryPath)) {
  console.error(`Résumé de couverture introuvable : ${summaryPath} (lancer jest --coverage d'abord).`);
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
const pct = summary.total.branches.pct;
if (typeof pct !== 'number' || Number.isNaN(pct)) {
  console.error('Pourcentage de couverture de branches illisible dans coverage-summary.json.');
  process.exit(1);
}

// Mêmes seuils de couleur que le badge de couverture de lignes, pour rester cohérent visuellement.
function colorFor(value) {
  if (value >= 90) return 'brightgreen';
  if (value >= 80) return 'green';
  if (value >= 70) return 'yellowgreen';
  if (value >= 60) return 'yellow';
  if (value >= 50) return 'orange';
  return 'red';
}

const rounded = Math.round(pct * 10) / 10;
const label = 'branch%20coverage';
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
      console.log(`Badge de couverture de branches généré (${rounded}%, ${color}) : ${outputPath}`);
    });
  })
  .on('error', (err) => {
    console.error('Échec du téléchargement du badge shields.io :', err.message);
    process.exit(1);
  });
