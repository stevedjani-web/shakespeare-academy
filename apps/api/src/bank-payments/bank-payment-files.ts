import { createHash, randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import type { CheckedFile } from '../expenses/expense-files';

/**
 * Preuves d'un paiement par banque (reçu de virement, bordereau de dépôt, photo du chèque) : pièces financières qui
 * contiennent des données bancaires, donc HORS du dossier `uploads` que l'API sert à tout le monde. Elles ne sortent que
 * par `GET /bank-payments/:id/proofs/:proofId`, derrière un jeton et un droit de lecture financière, et chaque lecture
 * est journalisée. Même contrôle du type que les autres pièces (`checkExpenseFile` : PDF, JPEG ou PNG lus dans le
 * contenu, 5 Mo). `process.cwd()`, pas `__dirname` (voir `main.ts`).
 */
export const BANK_PAYMENT_FILES_DIR = join(
  process.cwd(),
  'private-uploads',
  'bank-payments',
);

if (!existsSync(BANK_PAYMENT_FILES_DIR)) {
  mkdirSync(BANK_PAYMENT_FILES_DIR, { recursive: true });
}

/** Une déclaration porte de une à trois pièces (par exemple le recto et le verso d'un chèque). */
export const MAX_BANK_PROOFS = 3;

export function proofHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export async function storeBankProof(file: CheckedFile): Promise<string> {
  const name = `${randomUUID()}${file.detected.extension}`;
  await writeFile(join(BANK_PAYMENT_FILES_DIR, name), file.buffer, {
    flag: 'wx',
  });
  return name;
}

export function isStoredBankProofName(name: string): boolean {
  return /^[0-9a-f-]{36}\.(pdf|jpg|png)$/.test(name);
}

export function bankProofPath(name: string): string {
  return join(BANK_PAYMENT_FILES_DIR, name);
}

export async function removeBankProof(name: string | null | undefined) {
  if (!name || !isStoredBankProofName(name)) return;
  await unlink(join(BANK_PAYMENT_FILES_DIR, name)).catch(() => undefined);
}
