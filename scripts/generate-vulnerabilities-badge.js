#!/usr/bin/env node
/**
 * Compte les vulnérabilités connues réelles (apps/api + apps/web) et génère un badge SVG via shields.io.
 * Pas de Snyk : son badge public répond « monitored » pour n'importe quel dépôt GitHub sans jamais le
 * scanner réellement (aucun compte connecté ici) — vérifié avant de coder, aurait été un signal trompeur.
 * `npm audit` fait autorité (vrai registre d'avis de sécurité npm), jamais un chiffre inventé.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

/** npm audit sort avec un code non nul dès qu'une vulnérabilité existe — jamais une vraie erreur. */
function countVulnerabilities(dir) {
  let out;
  try {
    out = execSync('npm audit --json', { cwd: dir, encoding: 'utf8' });
  } catch (err) {
    out = err.stdout ? err.stdout.toString() : '';
  }
  try {
    const report = JSON.parse(out || '{}');
    const v = report.metadata ? report.metadata.vulnerabilities : report.vulnerabilities;
    return {
      critical: v.critical || 0,
      high: v.high || 0,
      moderate: v.moderate || 0,
      low: v.low || 0,
    };
  } catch (parseErr) {
    console.error(`Sortie de npm audit illisible pour ${dir} :`, parseErr.message);
    process.exit(1);
  }
}

const root = path.join(__dirname, '..');
const api = countVulnerabilities(path.join(root, 'apps', 'api'));
const web = countVulnerabilities(path.join(root, 'apps', 'web'));
const totals = {
  critical: api.critical + web.critical,
  high: api.high + web.high,
  moderate: api.moderate + web.moderate,
  low: api.low + web.low,
};
const total = totals.critical + totals.high + totals.moderate + totals.low;

function colorFor() {
  if (totals.critical > 0) return 'red';
  if (totals.high > 0) return 'red';
  if (totals.moderate > 0) return 'orange';
  if (totals.low > 0) return 'yellow';
  return 'brightgreen';
}

const value = total === 0 ? 'none' : `${total}%20found`;
const url = `https://img.shields.io/badge/vulnerabilities-${value}-${colorFor()}.svg`;
const outputPath = path.join(root, 'docs', 'badges', 'vulnerabilities.svg');

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
        `Badge de vulnérabilités généré (api : ${JSON.stringify(api)}, web : ${JSON.stringify(web)}, total : ${total}) : ${outputPath}`,
      );
    });
  })
  .on('error', (err) => {
    console.error('Échec du téléchargement du badge shields.io :', err.message);
    process.exit(1);
  });
