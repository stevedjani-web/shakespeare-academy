import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';
import { AuthService } from '../auth/auth.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { assertCanHandleReserved } from '../auth/reserved-permissions';
import type { CurrentUserData } from '../auth/types/current-user.interface';

const SAFE_USER_SELECT = {
  id: true,
  nom: true,
  prenom: true,
  email: true,
  statut: true,
  doitChangerMotDePasse: true,
  dernierLoginAt: true,
  createdAt: true,
  updatedAt: true,
  role: { select: { id: true, code: true, nom: true } },
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly schoolService: SchoolService,
    private readonly authService: AuthService,
  ) {}

  async findAll() {
    const schoolId = await this.schoolService.getDefaultId();
    return this.prisma.user.findMany({
      where: { schoolId },
      select: SAFE_USER_SELECT,
      orderBy: { nom: 'asc' },
    });
  }

  async findOne(id: string) {
    const schoolId = await this.schoolService.getDefaultId();
    const user = await this.prisma.user.findFirst({
      where: { id, schoolId },
      select: SAFE_USER_SELECT,
    });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable.');
    }
    return user;
  }

  /** Permissions portées par un rôle (vide si le rôle n'existe pas : la base refusera l'identifiant). */
  private async permissionsOfRole(roleId: string): Promise<string[]> {
    const rows = await this.prisma.rolePermission.findMany({
      where: { roleId },
      select: { permission: { select: { code: true } } },
    });
    return rows.map((r) => r.permission.code);
  }

  async create(dto: CreateUserDto, actor: CurrentUserData) {
    const actingUserId = actor.id;
    assertCanHandleReserved(
      actor.permissions,
      await this.permissionsOfRole(dto.roleId),
      'créer un compte avec ce rôle',
    );
    const schoolId = await this.schoolService.getDefaultId();
    const existing = await this.prisma.user.findFirst({
      where: { schoolId, email: dto.email },
    });
    if (existing) {
      throw new ConflictException(
        'Un utilisateur avec cet e-mail existe déjà.',
      );
    }

    const motDePasseHash = await this.authService.hashPassword(dto.motDePasse);
    const user = await this.prisma.user.create({
      data: {
        schoolId,
        roleId: dto.roleId,
        nom: dto.nom,
        prenom: dto.prenom,
        email: dto.email,
        motDePasseHash,
        doitChangerMotDePasse: true,
      },
      select: SAFE_USER_SELECT,
    });

    await this.auditService.log({
      schoolId,
      userId: actingUserId,
      action: 'USER_CREATE',
      entite: 'User',
      entiteId: user.id,
      nouvelleValeur: user,
    });

    return user;
  }

  async update(id: string, dto: UpdateUserDto, actor: CurrentUserData) {
    const actingUserId = actor.id;
    const before = await this.findOne(id);
    // Changer de rôle : ni le rôle quitté ni le rôle visé ne doivent porter de droit réservé que l'acteur n'a pas.
    // Désactiver ou renommer un compte reste permis (aucune élévation de droits).
    if (dto.roleId && dto.roleId !== before.role.id) {
      assertCanHandleReserved(
        actor.permissions,
        [
          ...(await this.permissionsOfRole(before.role.id)),
          ...(await this.permissionsOfRole(dto.roleId)),
        ],
        'changer le rôle de ce compte',
      );
    }
    const updated = await this.prisma.user.update({
      where: { id },
      data: dto,
      select: SAFE_USER_SELECT,
    });

    await this.auditService.log({
      schoolId: await this.schoolService.getDefaultId(),
      userId: actingUserId,
      action: 'USER_UPDATE',
      entite: 'User',
      entiteId: id,
      ancienneValeur: before,
      nouvelleValeur: updated,
    });

    return updated;
  }

  async resetPassword(
    id: string,
    dto: ResetPasswordDto,
    actor: CurrentUserData,
  ) {
    const actingUserId = actor.id;
    const target = await this.findOne(id);
    // Réinitialiser le mot de passe d'un compte, c'est pouvoir s'y connecter : interdit sur un compte qui porte des
    // droits réservés que l'acteur n'a pas (sinon la garde sur les rôles serait contournée).
    assertCanHandleReserved(
      actor.permissions,
      await this.permissionsOfRole(target.role.id),
      'réinitialiser le mot de passe de ce compte',
    );
    const motDePasseHash = await this.authService.hashPassword(
      dto.nouveauMotDePasse,
    );
    await this.prisma.user.update({
      where: { id },
      data: {
        motDePasseHash,
        doitChangerMotDePasse: true,
        tentativesEchecsConnexion: 0,
        verrouilleJusqua: null,
      },
    });

    const schoolId = await this.schoolService.getDefaultId();
    await this.auditService.log({
      schoolId,
      userId: actingUserId,
      action: 'USER_PASSWORD_RESET',
      entite: 'User',
      entiteId: id,
      // Jamais le hash, avant ou après : seule la survenue de la réinitialisation est journalisée.
    });

    return { success: true };
  }
}
