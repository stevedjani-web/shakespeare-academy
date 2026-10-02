import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { pick } from '../common/language';
import {
  detectBulletinType,
  safeDisplayName,
  type DetectedFile,
} from '../pre-registrations/preregistration-files';

/**
 * Justificatifs et preuves de décaissement d'une sortie : pièces financières, donc HORS du dossier `uploads` que l'API
 * sert à tout le monde. Elles ne sortent que par `GET /expenses/:id/attachments/:attachmentId`, derrière un jeton.
 * `process.cwd()`, pas `__dirname` : correct en dev comme en production (voir `main.ts`).
 */
export const EXPENSE_FILES_DIR = join(
  process.cwd(),
  'private-uploads',
  'expenses',
);

if (!existsSync(EXPENSE_FILES_DIR)) {
  mkdirSync(EXPENSE_FILES_DIR, { recursive: true });
}

export const MAX_EXPENSE_FILE_BYTES = 5 * 1024 * 1024;
/** Une demande porte au plus 5 justificatifs. */
export const MAX_JUSTIFICATIFS = 5;

export interface IncomingFile {
  buffer: Buffer;
  originalname: string;
}

export interface CheckedFile extends IncomingFile {
  detected: DetectedFile;
  nomAffiche: string;
}

/**
 * Le type réel se lit dans le contenu (PDF, JPEG ou PNG), jamais dans le nom ni dans le type annoncé par le navigateur.
 * Rien n'est écrit sur le disque ici : on valide tout avant de stocker quoi que ce soit.
 */
export function checkExpenseFile(file: IncomingFile): CheckedFile {
  const detected = detectBulletinType(file.buffer);
  if (!detected) {
    throw new BadRequestException(
      pick({
        fr: `« ${safeDisplayName(file.originalname)} » doit être un PDF, un JPEG ou un PNG.`,
        en: `"${safeDisplayName(file.originalname)}" must be a PDF, a JPEG or a PNG.`,
      }),
    );
  }
  return { ...file, detected, nomAffiche: safeDisplayName(file.originalname) };
}

export async function storeExpenseFile(file: CheckedFile): Promise<string> {
  const name = `${randomUUID()}${file.detected.extension}`;
  await writeFile(join(EXPENSE_FILES_DIR, name), file.buffer, { flag: 'wx' });
  return name;
}

/** Le nom stocké est toujours un UUID + extension : jamais un chemin, mais on ne fait pas confiance à la base. */
export function isStoredExpenseFileName(name: string): boolean {
  return /^[0-9a-f-]{36}\.(pdf|jpg|png)$/.test(name);
}

export function expenseFilePath(name: string): string {
  return join(EXPENSE_FILES_DIR, name);
}

export async function removeExpenseFile(name: string | null | undefined) {
  if (!name || !isStoredExpenseFileName(name)) return;
  await unlink(join(EXPENSE_FILES_DIR, name)).catch(() => undefined);
}
