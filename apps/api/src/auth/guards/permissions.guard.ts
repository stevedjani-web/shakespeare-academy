import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import type { CurrentUserData } from '../types/current-user.interface';

/**
 * CA14 : un utilisateur sans la permission requise reçoit un refus serveur, même en appelant l'API directement.
 * S'exécute après JwtAuthGuard (qui peuple request.user) — une route sans @RequirePermission n'exige
 * que d'être authentifié.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermission = this.reflector.getAllAndOverride<
      string | undefined
    >(PERMISSION_KEY, [context.getHandler(), context.getClass()]);
    if (!requiredPermission) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: CurrentUserData }>();
    const user = request.user;
    if (!user || !user.permissions.includes(requiredPermission)) {
      throw new ForbiddenException(
        `Permission requise : ${requiredPermission}.`,
      );
    }
    return true;
  }
}
