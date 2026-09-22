#!/usr/bin/env node
/**
 * Compte les vraies lignes de code (fichiers .ts/.tsx suivis par git, lignes non vides) et génère un
 * badge SVG via shields.io. tokei.rs (service habituel pour ce genre de badge) ne résout même plus en
 * DNS — vérifié avant de choisir cette approche, le service est manifestement à l'arrêt. `git ls-files`
 * + un vrai comptage de lignes font autorité, jamais un chiffre inventé. Uniquement sur push : ce nombre
 * ne change jamais sans un commit.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const root = path.join(__dirname, '..');
const files = execSync('git ls-files', { cwd: root, encoding: 'utf8' })
  .split('\n')
  .map((f) => f.trim())
  .filter((f) => /\.(ts|tsx)$/.test(f));

let total = 0;
for (const file of files) {
  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath)) continue; // fichier supprimé mais encore dans un index périmé
  const content = fs.readFileSync(fullPath, 'utf8');
  total += content.split('\n').filter((line) => line.trim().length > 0).length;
}

if (total === 0) {
  console.error('Aucune ligne comptée — refus de générer un badge à 0 (probablement une erreur).');
  process.exit(1);
}

const url = `https://img.shields.io/badge/lines%20of%20code-${total}-blueviolet.svg`;
const outputPath = path.join(root, 'docs', 'badges', 'loc.svg');

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
        `Badge de lignes de code généré (${total} lignes non vides sur ${files.length} fichiers .ts/.tsx) : ${outputPath}`,
      );
    });
  })
  .on('error', (err) => {
    console.error('Échec du téléchargement du badge shields.io :', err.message);
    process.exit(1);
  });
