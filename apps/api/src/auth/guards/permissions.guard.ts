import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { CurrentUserData } from '../types/current-user.interface';

/**
 * CA14 : un utilisateur sans la permission requise reçoit un refus serveur, même en appelant l'API directement.
 * S'exécute après JwtAuthGuard (qui peuple request.user) — une route sans @RequirePermission n'exige
 * que d'être authentifié. `@Public()` (une route au sein d'un contrôleur par ailleurs protégé, ex.
 * la vérification de reçu) fait aussi sauter cette vérification — sinon `request.user` resterait
 * vide (JwtAuthGuard ne l'a jamais peuplé) et toute permission de classe échouerait en 403.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

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
