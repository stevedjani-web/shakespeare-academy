import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

// Photos d'élèves (données d'un mineur) : volontairement HORS du dossier `uploads`, que l'API sert à tout le monde.
// Elles ne sortent que par `GET /students/:id/photo`, réservé au personnel connecté.
// `process.cwd()`, pas `__dirname` : correct en dev comme en production (voir `main.ts`).
export const STUDENT_PHOTO_DIR = join(
  process.cwd(),
  'private-uploads',
  'students',
);

if (!existsSync(STUDENT_PHOTO_DIR)) {
  mkdirSync(STUDENT_PHOTO_DIR, { recursive: true });
}

export const studentPhotoMulterOptions = {
  storage: diskStorage({
    destination: STUDENT_PHOTO_DIR,
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
          'Format non supporté (JPEG, PNG ou WebP uniquement).',
        ),
        false,
      );
      return;
    }
    callback(null, true);
  },
  limits: { fileSize: 2 * 1024 * 1024 },
};
