import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { Observable, from, of } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUserData } from '../auth/types/current-user.interface';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const KEY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;

/**
 * Synchronisation hors ligne (D49) : une saisie faite sans Internet est rejouée au retour du réseau,
 * et une réponse perdue en chemin fait renvoyer la même requête. Avec l'en-tête `Idempotency-Key`,
 * la première réponse réussie est mémorisée (par utilisateur) et rendue telle quelle aux renvois —
 * jamais deux élèves, deux inscriptions ou deux dépenses pour une seule saisie. Sans en-tête, aucun
 * changement : le comportement habituel de l'API reste strictement le même.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> | Promise<Observable<unknown>> {
    if (context.getType() !== 'http') return next.handle();
    const http = context.switchToHttp();
    const req = http.getRequest<Request & { user?: CurrentUserData }>();
    const res = http.getResponse<Response>();
    const rawKey = req.headers['idempotency-key'];
    if (!rawKey || !MUTATING_METHODS.has(req.method) || !req.user) return next.handle();

    const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
    if (!KEY_PATTERN.test(key)) {
      throw new BadRequestException('Idempotency-Key invalide (8 à 100 caractères alphanumériques, - ou _).');
    }
    const userId = req.user.id;
    const path = req.originalUrl.split('?')[0];

    return from(this.prisma.idempotencyRecord.findUnique({ where: { userId_key: { userId, key } } })).pipe(
      mergeMap((existing) => {
        if (existing) {
          if (existing.method !== req.method || existing.path !== path) {
            throw new ConflictException('Cette Idempotency-Key a déjà servi pour une autre requête.');
          }
          res.status(existing.statusCode);
          return of(existing.response);
        }
        return next.handle().pipe(
          mergeMap(async (body: unknown) => {
            const statusCode = res.statusCode || (req.method === 'POST' ? 201 : 200);
            try {
              await this.prisma.idempotencyRecord.create({
                data: {
                  userId,
                  key,
                  method: req.method,
                  path,
                  statusCode,
                  response:
                    body === undefined || body === null
                      ? Prisma.JsonNull
                      : (JSON.parse(JSON.stringify(body)) as Prisma.InputJsonValue),
                },
              });
            } catch {
              // Deux requêtes simultanées avec la même clé : la première a déjà enregistré, on ignore.
            }
            return body;
          }),
        );
      }),
    );
  }
}
