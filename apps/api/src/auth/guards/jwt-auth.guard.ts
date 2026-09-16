import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type {
  AccessTokenPayload,
  CurrentUserData,
} from '../types/current-user.interface';

/**
 * Vérifie le jeton d'accès et recharge l'utilisateur (rôle + permissions) depuis la base à chaque requête,
 * plutôt que de faire confiance aux permissions embarquées dans le jeton : un compte désactivé ou un rôle
 * modifié doit avoir un effet immédiat, pas seulement à l'expiration du jeton court.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('Authentification requise.');
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: process.env.JWT_ACCESS_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Session invalide ou expirée.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        role: {
          include: { rolePermissions: { include: { permission: true } } },
        },
      },
    });

    if (!user || user.statut !== 'ACTIF') {
      throw new UnauthorizedException('Compte introuvable ou désactivé.');
    }

    const currentUser: CurrentUserData = {
      id: user.id,
      schoolId: user.schoolId,
      roleId: user.roleId,
      roleCode: user.role.code,
      permissions: user.role.rolePermissions.map((rp) => rp.permission.code),
      nom: user.nom,
      prenom: user.prenom,
      email: user.email,
    };

    (request as Request & { user: CurrentUserData }).user = currentUser;
    return true;
  }

  private extractToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return null;
    }
    return header.slice('Bearer '.length).trim() || null;
  }
}
