import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { pick } from '../common/language';

/**
 * Bulletins joints à une préinscription : données d'un mineur, donc HORS du dossier `uploads` que l'API sert à tout le
 * monde. Ils ne sortent que par `GET /preinscriptions/enfants/:id/bulletin`, réservé au personnel habilité.
 * `process.cwd()`, pas `__dirname` : correct en dev comme en production (voir `main.ts`).
 */
export const PREREGISTRATION_FILES_DIR = join(
  process.cwd(),
  'private-uploads',
  'preinscriptions',
);

if (!existsSync(PREREGISTRATION_FILES_DIR)) {
  mkdirSync(PREREGISTRATION_FILES_DIR, { recursive: true });
}

/** 5 Mo par bulletin : assez pour un scan ou une photo, assez peu pour ne pas remplir le disque. */
export const MAX_BULLETIN_BYTES = 5 * 1024 * 1024;

export interface DetectedFile {
  type: 'application/pdf' | 'image/jpeg' | 'image/png';
  extension: '.pdf' | '.jpg' | '.png';
}

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/**
 * Type réel d'un fichier d'après son contenu (les premiers octets), jamais d'après le nom ni le type annoncé par le
 * navigateur : un exécutable renommé en .pdf est refusé.
 */
export function detectBulletinType(buffer: Buffer): DetectedFile | null {
  if (
    buffer.length >= 5 &&
    buffer.subarray(0, 5).toString('latin1') === '%PDF-'
  ) {
    return { type: 'application/pdf', extension: '.pdf' };
  }
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { type: 'image/jpeg', extension: '.jpg' };
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return { type: 'image/png', extension: '.png' };
  }
  return null;
}

/**
 * Le décodage des en-têtes multipart lit le nom du fichier en latin1 : un nom envoyé en UTF-8 (« é ») arrive en
 * « Ã© ». On le redécode en UTF-8 quand c'est cohérent, sinon on garde le nom tel quel.
 */
function fixEncoding(name: string): string {
  const codes = [...name].map((c) => c.charCodeAt(0));
  if (!codes.some((c) => c >= 0x80) || codes.some((c) => c > 0xff)) {
    return name;
  }
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('�') ? name : decoded;
}

/** Nom affiché d'un fichier envoyé : sans chemin, sans caractère de contrôle, 100 caractères au plus. */
export function safeDisplayName(original: string): string {
  const base = fixEncoding(original).replace(/\\/g, '/').split('/').pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return clean.slice(0, 100) || 'bulletin';
}

export async function storeBulletin(
  buffer: Buffer,
  detected: DetectedFile,
): Promise<string> {
  const name = `${randomUUID()}${detected.extension}`;
  await writeFile(join(PREREGISTRATION_FILES_DIR, name), buffer, {
    flag: 'wx',
  });
  return name;
}

/** Le nom stocké est toujours un UUID + extension : jamais un chemin, mais on ne fait pas confiance à la base. */
export function isStoredBulletinName(name: string): boolean {
  return /^[0-9a-f-]{36}\.(pdf|jpg|png)$/.test(name);
}

export async function removeBulletin(name: string | null | undefined) {
  if (!name || !isStoredBulletinName(name)) return;
  await unlink(join(PREREGISTRATION_FILES_DIR, name)).catch(() => undefined);
}

export function badBulletin(prenom: string): BadRequestException {
  return new BadRequestException(
    pick({
      fr: `Le bulletin de ${prenom} doit être un PDF, un JPEG ou un PNG.`,
      en: `${prenom}'s report must be a PDF, a JPEG or a PNG.`,
    }),
  );
}
