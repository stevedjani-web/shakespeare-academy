import { BadRequestException } from '@nestjs/common';
import { rename, stat, unlink } from 'fs/promises';
import sharp from 'sharp';

/** Largeur maximale d'un logo enregistré : assez pour un écran à haute densité, bien moins lourd qu'un original. */
export const LOGO_MAX_WIDTH = 800;

export interface OptimizedImage {
  largeur: number;
  hauteur: number;
  octetsAvant: number;
  octetsApres: number;
}

/**
 * Réduit une image déjà enregistrée sur le disque (largeur maximale, orientation EXIF appliquée, compression), en
 * gardant son format et sa transparence, puis remplace le fichier. Ne grossit jamais une image : une image plus
 * petite que la limite est seulement recompressée, et gardée telle quelle si le résultat n'est pas plus léger.
 *
 * Décode aussi réellement l'image : un fichier qui n'en est pas une (type annoncé mensonger, fichier corrompu) est
 * supprimé et refusé, ce que le seul contrôle du type MIME envoyé par le navigateur ne fait pas.
 */
export async function optimizeImageFile(
  path: string,
  maxWidth = LOGO_MAX_WIDTH,
): Promise<OptimizedImage> {
  const octetsAvant = (await stat(path)).size;
  const temp = `${path}.optimise`;
  try {
    const pipeline = sharp(path, { failOn: 'error' })
      .rotate()
      .resize({ width: maxWidth, withoutEnlargement: true });
    const meta = await sharp(path, { failOn: 'error' }).metadata();
    switch (meta.format) {
      case 'png':
        pipeline.png({ compressionLevel: 9, palette: true, quality: 90 });
        break;
      case 'jpeg':
        pipeline.jpeg({ quality: 85, mozjpeg: true });
        break;
      case 'webp':
        pipeline.webp({ quality: 85 });
        break;
      default:
        throw new Error(`format ${meta.format ?? 'inconnu'}`);
    }
    const info = await pipeline.toFile(temp);
    if (info.size >= octetsAvant && (meta.width ?? 0) <= maxWidth) {
      // Déjà léger : on garde l'original, sans le dégrader pour rien.
      await unlink(temp);
      return {
        largeur: meta.width ?? info.width,
        hauteur: meta.height ?? info.height,
        octetsAvant,
        octetsApres: octetsAvant,
      };
    }
    await rename(temp, path);
    return {
      largeur: info.width,
      hauteur: info.height,
      octetsAvant,
      octetsApres: info.size,
    };
  } catch {
    await unlink(temp).catch(() => undefined);
    await unlink(path).catch(() => undefined);
    throw new BadRequestException(
      "Ce fichier n'est pas une image lisible (JPEG, PNG ou WebP).",
    );
  }
}
