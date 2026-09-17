/**
 * Génération CSV minimaliste (jamais une dépendance ajoutée pour ça) : séparateur point-virgule
 * (Excel FR ouvre un CSV virgule comme une seule colonne tant que la locale système n'est pas
 * changée — le point-virgule évite ce piège classique), BOM UTF-8 en tête (sans lui, Excel affiche
 * les accents comme des caractères corrompus).
 */
function escapeCsvValue(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (str.includes(';') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns: Array<{ key: keyof T; label: string }>,
): string {
  const header = columns.map((c) => escapeCsvValue(c.label)).join(';');
  const lines = rows.map((row) => columns.map((c) => escapeCsvValue(row[c.key])).join(';'));
  return '﻿' + [header, ...lines].join('\r\n');
}
