// Conversion d'un montant entier (XAF, jamais de décimales — RG16) en toutes lettres françaises,
// pour la mention "Arrêté le présent reçu à la somme de..." — jusqu'au milliard, largement
// suffisant pour un montant scolaire réel.
const UNITS = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf'];
const TEENS = [
  'dix',
  'onze',
  'douze',
  'treize',
  'quatorze',
  'quinze',
  'seize',
  'dix-sept',
  'dix-huit',
  'dix-neuf',
];
const TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];

// `pluralizable` : "quatre-vingts"/"...cents" ne prennent un "s" que lorsque rien de plus petit ne
// suit DANS TOUT LE NOMBRE (ex. 80 → "quatre-vingts", mais 80 000 → "quatre-vingt mille" jamais
// "quatre-vingts mille") — donc seul le groupe des unités (non multiplié par mille/million) peut
// être pluralisé, jamais un groupe de milliers/millions.
function twoDigitsToWords(n: number, pluralizable: boolean): string {
  if (n < 10) return UNITS[n];
  if (n < 20) return TEENS[n - 10];
  const ten = Math.floor(n / 10);
  const unit = n % 10;
  if (ten === 7 || ten === 9) {
    // soixante-dix..79, quatre-vingt-dix..99 : construits sur la base de 60/80 + 10..19
    const base = ten === 7 ? 'soixante' : 'quatre-vingt';
    return unit === 0 ? `${base}-dix` : `${base}-${TEENS[unit]}`;
  }
  if (unit === 0) return ten === 8 ? `quatre-vingt${pluralizable ? 's' : ''}` : TENS[ten];
  if (unit === 1 && ten !== 8) return `${TENS[ten]}-et-un`;
  return `${TENS[ten]}-${UNITS[unit]}`;
}

function threeDigitsToWords(n: number, pluralizable: boolean): string {
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  let words = '';
  if (hundred > 0) {
    words += hundred === 1 ? 'cent' : `${UNITS[hundred]} cent`;
    if (hundred > 1 && rest === 0 && pluralizable) words += 's';
    if (rest > 0) words += ' ';
  }
  if (rest > 0) words += twoDigitsToWords(rest, pluralizable);
  return words;
}

/** `0` → "zéro" ; sinon jamais de zéro isolé dans un groupe (ex. "mille deux" pas "mille zéro deux"). */
export function nombreEnLettresFr(amount: number): string {
  const n = Math.round(Math.abs(amount));
  if (n === 0) return 'zéro';

  const billions = Math.floor(n / 1_000_000_000);
  const millions = Math.floor((n % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1_000);
  const units = n % 1_000;

  const parts: string[] = [];
  if (billions > 0) parts.push(`${threeDigitsToWords(billions, false)} milliard${billions > 1 ? 's' : ''}`);
  if (millions > 0) parts.push(`${threeDigitsToWords(millions, false)} million${millions > 1 ? 's' : ''}`);
  if (thousands > 0) parts.push(thousands === 1 ? 'mille' : `${threeDigitsToWords(thousands, false)} mille`);
  if (units > 0) parts.push(threeDigitsToWords(units, true));

  return parts.join(' ');
}

export function montantEnLettres(amount: number, devise = 'francs CFA'): string {
  return `${nombreEnLettresFr(amount)} ${devise}`;
}
