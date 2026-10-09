import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { unlink, writeFile } from 'fs/promises';
import { basename, join } from 'path';
import sharp from 'sharp';
import { pick } from '../common/language';

/**
 * Photos d'identité envoyées par les parents (données d'un mineur) : HORS du dossier `uploads`, que l'API sert à tout le
 * monde. Elles ne sortent que par `GET /family-collection/children/:id/photo`, réservé au personnel habilité, puis,
 * à la validation, rejoignent le dossier privé des photos d'élèves.
 * `process.cwd()`, pas `__dirname` : correct en dev comme en production (voir `main.ts`).
 */
export const FAMILY_PHOTO_DIR = join(
  process.cwd(),
  'private-uploads',
  'family-photos',
);

if (!existsSync(FAMILY_PHOTO_DIR)) {
  mkdirSync(FAMILY_PHOTO_DIR, { recursive: true });
}

/** Le navigateur envoie déjà une image recadrée et réduite (quelques dizaines de Ko) : 3 Mo laissent une large marge. */
export const MAX_FAMILY_PHOTO_BYTES = 3 * 1024 * 1024;

/** Portrait 3:4, comme la carte d'élève : le serveur impose ce cadrage, quoi que le navigateur ait envoyé. */
export const FAMILY_PHOTO_WIDTH = 450;
export const FAMILY_PHOTO_HEIGHT = 600;

function badPhoto(): BadRequestException {
  return new BadRequestException(
    pick({
      fr: 'Cette photo est illisible (JPEG, PNG ou WebP uniquement).',
      en: 'This photo cannot be read (JPEG, PNG or WebP only).',
    }),
  );
}

/**
 * Décode réellement l'image (un fichier qui n'en est pas une, ou un format autre que JPEG, PNG, WebP, est refusé),
 * applique son orientation, la recadre en portrait 3:4 et l'enregistre en JPEG sous un nom aléatoire.
 * Renvoie le nom du fichier enregistré.
 */
export async function storeFamilyPhoto(buffer: Buffer): Promise<string> {
  try {
    const meta = await sharp(buffer, { failOn: 'error' }).metadata();
    if (!meta.format || !['jpeg', 'png', 'webp'].includes(meta.format)) {
      throw new Error('format');
    }
    const output = await sharp(buffer, { failOn: 'error' })
      .rotate()
      .resize(FAMILY_PHOTO_WIDTH, FAMILY_PHOTO_HEIGHT, {
        fit: 'cover',
        position: 'attention',
      })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
    const filename = `${randomUUID()}.jpg`;
    await writeFile(join(FAMILY_PHOTO_DIR, filename), output);
    return filename;
  } catch {
    throw badPhoto();
  }
}

/** Chemin d'un fichier de ce dossier, sans jamais en sortir, même si la valeur en base était altérée. */
export function familyPhotoPath(filename: string): string {
  return join(FAMILY_PHOTO_DIR, basename(filename));
}

export async function removeFamilyPhoto(
  filename: string | null | undefined,
): Promise<void> {
  if (!filename) return;
  await unlink(familyPhotoPath(filename)).catch(() => undefined);
}
