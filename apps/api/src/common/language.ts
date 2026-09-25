import { AsyncLocalStorage } from 'node:async_hooks';
import { IsIn } from 'class-validator';
import type { NextFunction, Request, Response } from 'express';

/** Langues de la plateforme. Le français reste la langue de repli de tout texte pas encore traduit. */
export const SUPPORTED_LANGUAGES = ['fr', 'en'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/** Corps de `PATCH /auth/language` et de `PATCH /portal/language`. */
export class SetLanguageDto {
  @IsIn(SUPPORTED_LANGUAGES, {
    message: 'Langue non prise en charge (fr ou en).',
  })
  langue!: AppLanguage;
}

/** « en-GB,en;q=0.9,fr;q=0.8 » donne « en » ; tout ce qui n'est ni français ni anglais donne le français. */
export function parseAcceptLanguage(header: string | undefined): AppLanguage {
  if (!header) return 'fr';
  const ranked = header
    .split(',')
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.find((p) => p.trim().startsWith('q='));
      const weight = q ? Number(q.trim().slice(2)) : 1;
      return {
        base: tag.trim().toLowerCase().split('-')[0],
        weight: Number.isFinite(weight) ? weight : 0,
        index,
      };
    })
    .filter((x) => x.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  for (const { base } of ranked) {
    if (base === 'fr' || base === 'en') return base;
  }
  return 'fr';
}

const storage = new AsyncLocalStorage<AppLanguage>();

/** Langue de la requête en cours (en-tête Accept-Language) ; le français hors requête. */
export function currentLanguage(): AppLanguage {
  return storage.getStore() ?? 'fr';
}

/** Middleware : fixe la langue de la requête pour tout le traitement qui suit (services, exceptions). */
export function languageMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const header = req.headers['accept-language'];
  storage.run(parseAcceptLanguage(header), () => next());
}

/** Choisit le texte selon la langue de la requête : `pick({ fr: '…', en: '…' })`. */
export function pick(texts: Record<AppLanguage, string>): string {
  return texts[currentLanguage()];
}

/** Message de validation (class-validator) évalué à la validation, donc dans la langue de la requête. */
export const msg = (fr: string, en: string) => (): string => pick({ fr, en });
