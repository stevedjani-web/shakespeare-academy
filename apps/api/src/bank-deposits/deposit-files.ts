import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import type { CheckedFile } from '../expenses/expense-files';

/**
 * Bordereaux de versement : pièces financières, donc HORS du dossier `uploads` que l'API sert à tout le monde. Elles ne
 * sortent que par `GET /bank-deposits/:id/receipt`, derrière un jeton. Même contrôle du type que les justificatifs de
 * sorties (`checkExpenseFile` : PDF, JPEG ou PNG lus dans le contenu, 5 Mo). `process.cwd()`, pas `__dirname` (voir `main.ts`).
 */
export const DEPOSIT_FILES_DIR = join(
  process.cwd(),
  'private-uploads',
  'deposits',
);

if (!existsSync(DEPOSIT_FILES_DIR)) {
  mkdirSync(DEPOSIT_FILES_DIR, { recursive: true });
}

export async function storeDepositFile(file: CheckedFile): Promise<string> {
  const name = `${randomUUID()}${file.detected.extension}`;
  await writeFile(join(DEPOSIT_FILES_DIR, name), file.buffer, { flag: 'wx' });
  return name;
}

export function isStoredDepositFileName(name: string): boolean {
  return /^[0-9a-f-]{36}\.(pdf|jpg|png)$/.test(name);
}

export function depositFilePath(name: string): string {
  return join(DEPOSIT_FILES_DIR, name);
}

export async function removeDepositFile(name: string | null | undefined) {
  if (!name || !isStoredDepositFileName(name)) return;
  await unlink(join(DEPOSIT_FILES_DIR, name)).catch(() => undefined);
}
