import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { pick } from './language';

/**
 * Un envoi avec pièces arrive en multipart : le champ `payload` porte le JSON, les pièces sont des fichiers joints. Le
 * corps multipart n'est pas un DTO : on le valide ici, avec les mêmes règles que n'importe quel corps JSON.
 */
export async function parsePayload<T extends object>(
  type: new () => T,
  body: Record<string, unknown>,
): Promise<T> {
  let raw: unknown = body;
  if (typeof body?.payload === 'string') {
    try {
      raw = JSON.parse(body.payload);
    } catch {
      throw new BadRequestException(
        pick({
          fr: 'La demande est illisible.',
          en: 'The request cannot be read.',
        }),
      );
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BadRequestException(
      pick({ fr: 'La demande est vide.', en: 'The request is empty.' }),
    );
  }
  const dto = plainToInstance(type, raw);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  if (errors.length > 0) {
    throw new BadRequestException(
      errors.flatMap((e) => Object.values(e.constraints ?? {})),
    );
  }
  return dto;
}

export function onlyFields(
  files: Express.Multer.File[] | undefined,
  prefix: string,
): Express.Multer.File[] {
  const list = files ?? [];
  for (const file of list) {
    if (!file.fieldname.startsWith(prefix)) {
      throw new BadRequestException(
        pick({
          fr: 'Fichier joint inattendu.',
          en: 'Unexpected attached file.',
        }),
      );
    }
  }
  return list;
}
