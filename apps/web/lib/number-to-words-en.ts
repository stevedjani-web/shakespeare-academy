// Conversion d'un montant entier (XAF, jamais de décimales, RG16) en toutes lettres anglaises (orthographe
// britannique : « one hundred and twenty », « and » avant le dernier groupe), pour la mention « ... somme de » des reçus.
const UNITS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const TEENS = ["ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function twoDigits(n: number): string {
  if (n < 10) return UNITS[n];
  if (n < 20) return TEENS[n - 10];
  const unit = n % 10;
  return unit === 0 ? TENS[Math.floor(n / 10)] : `${TENS[Math.floor(n / 10)]}-${UNITS[unit]}`;
}

function threeDigits(n: number): string {
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  if (hundred === 0) return twoDigits(rest);
  const head = `${UNITS[hundred]} hundred`;
  return rest === 0 ? head : `${head} and ${twoDigits(rest)}`;
}

/** 0 donne « zero » ; « one thousand and fifty », « two million five hundred thousand ». */
export function numberToWordsEn(amount: number): string {
  const n = Math.round(Math.abs(amount));
  if (n === 0) return "zero";

  const billions = Math.floor(n / 1_000_000_000);
  const millions = Math.floor((n % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1_000);
  const units = n % 1_000;

  const parts: string[] = [];
  if (billions > 0) parts.push(`${threeDigits(billions)} billion`);
  if (millions > 0) parts.push(`${threeDigits(millions)} million`);
  if (thousands > 0) parts.push(`${threeDigits(thousands)} thousand`);
  if (units > 0) {
    // « one thousand and fifty », « one million and five » : « and » quand le dernier groupe est sous cent.
    parts.push(parts.length > 0 && units < 100 ? `and ${threeDigits(units)}` : threeDigits(units));
  }
  return parts.join(" ");
}
