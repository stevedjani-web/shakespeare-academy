import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { unlink } from 'fs/promises';
import { extname, join } from 'path';

/**
 * Cachet de l'établissement et signature d'un caissier : ce sont ce qui donne sa valeur à un reçu, donc HORS du
 * dossier `uploads` que l'API sert à tout le monde. Ils ne sortent que par `/receipt-assets/*`, réservé au personnel
 * habilité. `process.cwd()`, pas `__dirname` : correct en dev comme en production (voir `main.ts`).
 */
export const RECEIPT_ASSETS_DIR = join(
  process.cwd(),
  'private-uploads',
  'receipts',
);

if (!existsSync(RECEIPT_ASSETS_DIR)) {
  mkdirSync(RECEIPT_ASSETS_DIR, { recursive: true });
}

const EXTENSIONS: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};

export const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
};

/** Largeur maximale d'un cachet ou d'une signature enregistrés : bien assez pour un reçu A4, bien moins lourd. */
export const RECEIPT_ASSET_MAX_WIDTH = 600;

export const receiptAssetMulterOptions = {
  storage: diskStorage({
    destination: RECEIPT_ASSETS_DIR,
    // Extension déduite du type accepté, jamais du nom envoyé par le client.
    filename: (_req, file, callback) => {
      callback(null, `${randomUUID()}${EXTENSIONS[file.mimetype] ?? ''}`);
    },
  }),
  fileFilter: (
    _req: unknown,
    file: Express.Multer.File,
    callback: (error: Error | null, accept: boolean) => void,
  ) => {
    if (!EXTENSIONS[file.mimetype]) {
      callback(
        new BadRequestException(
          'Format non supporté (PNG, JPEG ou WebP uniquement).',
        ),
        false,
      );
      return;
    }
    callback(null, true);
  },
  limits: { fileSize: 2 * 1024 * 1024 },
};

/** Le nom stocké est toujours un UUID + extension : jamais un chemin, mais on ne fait pas confiance à la base. */
export function isStoredAssetName(name: string | null | undefined): boolean {
  return !!name && /^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(name);
}

export function assetPath(name: string): string {
  return join(RECEIPT_ASSETS_DIR, name);
}

export function assetContentType(name: string): string {
  return CONTENT_TYPES[extname(name)] ?? 'application/octet-stream';
}

export async function removeAsset(name: string | null | undefined) {
  if (!isStoredAssetName(name)) return;
  await unlink(assetPath(name as string)).catch(() => undefined);
}
