import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { pick } from '../common/language';
import type { Request } from 'express';
import { ParentAuthService } from './parent-auth.service';

export interface ParentIdentity {
  accountId: string;
  guardianId: string;
}

/**
 * Garde des routes du portail : exige un jeton de parent valide. Les routes du portail sont marquées
 * publiques pour la garde du personnel (qui ne connaît pas les parents) et protégées par celle-ci.
 */
@Injectable()
export class ParentAuthGuard implements CanActivate {
  constructor(private readonly auth: ParentAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { parent?: ParentIdentity }>();
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ')
      ? header.slice('Bearer '.length).trim()
      : '';
    if (!token) {
      throw new UnauthorizedException(
        pick({
          fr: 'Authentification requise.',
          en: 'Authentication required.',
        }),
      );
    }
    request.parent = await this.auth.verifyAccessToken(token);
    return true;
  }
}
