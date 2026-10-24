import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { unlink, writeFile } from 'fs/promises';
import { basename, join } from 'path';
import sharp from 'sharp';
import { pick } from '../common/language';

/**
 * Photos d'identité des enseignants : HORS du dossier `uploads`, que l'API sert à tout le monde. Elles ne sortent que par
 * des routes réservées au personnel habilité. La photo reçue pendant la collecte devient celle de la fiche à la
 * validation (même fichier). `process.cwd()`, pas `__dirname` : correct en dev comme en production.
 */
export const TEACHER_PHOTO_DIR = join(
  process.cwd(),
  'private-uploads',
  'teacher-photos',
);

if (!existsSync(TEACHER_PHOTO_DIR)) {
  mkdirSync(TEACHER_PHOTO_DIR, { recursive: true });
}

/** Le navigateur envoie déjà une image recadrée et réduite : 3 Mo laissent une large marge. */
export const MAX_TEACHER_PHOTO_BYTES = 3 * 1024 * 1024;

/** Portrait 3:4, comme la carte d'élève : le serveur impose ce cadrage, quoi que le navigateur ait envoyé. */
export const TEACHER_PHOTO_WIDTH = 450;
export const TEACHER_PHOTO_HEIGHT = 600;

function badPhoto(): BadRequestException {
  return new BadRequestException(
    pick({
      fr: 'Cette photo est illisible (JPEG, PNG ou WebP uniquement).',
      en: 'This photo cannot be read (JPEG, PNG or WebP only).',
    }),
  );
}

/** Décode réellement l'image, la recadre en portrait 3:4 et l'enregistre en JPEG sous un nom aléatoire. */
export async function storeTeacherPhoto(buffer: Buffer): Promise<string> {
  try {
    const meta = await sharp(buffer, { failOn: 'error' }).metadata();
    if (!meta.format || !['jpeg', 'png', 'webp'].includes(meta.format)) {
      throw new Error('format');
    }
    const output = await sharp(buffer, { failOn: 'error' })
      .rotate()
      .resize(TEACHER_PHOTO_WIDTH, TEACHER_PHOTO_HEIGHT, {
        fit: 'cover',
        position: 'attention',
      })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
    const filename = `${randomUUID()}.jpg`;
    await writeFile(join(TEACHER_PHOTO_DIR, filename), output);
    return filename;
  } catch {
    throw badPhoto();
  }
}

/** Chemin d'un fichier de ce dossier, sans jamais en sortir, même si la valeur en base était altérée. */
export function teacherPhotoPath(filename: string): string {
  return join(TEACHER_PHOTO_DIR, basename(filename));
}

export async function removeTeacherPhoto(
  filename: string | null | undefined,
): Promise<void> {
  if (!filename) return;
  await unlink(teacherPhotoPath(filename)).catch(() => undefined);
}
