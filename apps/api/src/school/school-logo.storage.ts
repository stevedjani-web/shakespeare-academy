import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
// `process.cwd()`, pas `__dirname` : correct aussi bien en dev (ts-node depuis `src/`) qu'en
// production (`dist/src/`) — voir la même remarque dans `main.ts`.
export const SCHOOL_LOGO_UPLOAD_DIR = join(process.cwd(), 'uploads', 'school');

// Dossier créé au chargement du module plutôt qu'à la première requête : évite une course entre
// deux premières requêtes concurrentes qui tenteraient chacune de le créer.
if (!existsSync(SCHOOL_LOGO_UPLOAD_DIR)) {
  mkdirSync(SCHOOL_LOGO_UPLOAD_DIR, { recursive: true });
}

// Image de la signature du directeur (Lot 19) : PNG ou JPEG (les seuls formats que le PDF sait intégrer), 1 Mo.
export const schoolSignatureMulterOptions = {
  storage: diskStorage({
    destination: SCHOOL_LOGO_UPLOAD_DIR,
    filename: (_req, file, callback) => {
      callback(
        null,
        `signature-${randomUUID()}${file.mimetype === 'image/png' ? '.png' : '.jpg'}`,
      );
    },
  }),
  fileFilter: (
    _req: unknown,
    file: Express.Multer.File,
    callback: (error: Error | null, accept: boolean) => void,
  ) => {
    if (file.mimetype !== 'image/png' && file.mimetype !== 'image/jpeg') {
      callback(
        new BadRequestException(
          'Format non supporté (PNG ou JPEG uniquement).',
        ),
        false,
      );
      return;
    }
    callback(null, true);
  },
  limits: { fileSize: 1024 * 1024 },
};

export const schoolLogoMulterOptions = {
  storage: diskStorage({
    destination: SCHOOL_LOGO_UPLOAD_DIR,
    filename: (_req, file, callback) => {
      callback(null, `${randomUUID()}${extname(file.originalname)}`);
    },
  }),
  fileFilter: (
    _req: unknown,
    file: Express.Multer.File,
    callback: (error: Error | null, accept: boolean) => void,
  ) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
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
  limits: { fileSize: 5 * 1024 * 1024 },
};
