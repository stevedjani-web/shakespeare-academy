import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { SetRolePermissionsDto } from './dto/set-role-permissions.dto';
import { assertCanHandleReserved } from '../auth/reserved-permissions';
import type { CurrentUserData } from '../auth/types/current-user.interface';

const ROLE_INCLUDE = {
  rolePermissions: { include: { permission: true } },
} as const;

type RoleWithPermissions = Prisma.RoleGetPayload<{
  include: typeof ROLE_INCLUDE;
}>;

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly schoolService: SchoolService,
  ) {}

  async findAll() {
    const roles = await this.prisma.role.findMany({
      include: ROLE_INCLUDE,
      orderBy: { nom: 'asc' },
    });
    return roles.map((role) => this.mapRole(role));
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: ROLE_INCLUDE,
    });
    if (!role) {
      throw new NotFoundException('Rôle introuvable.');
    }
    return this.mapRole(role);
  }

  listPermissionsCatalog() {
    return this.prisma.permission.findMany({ orderBy: { code: 'asc' } });
  }

  async create(dto: CreateRoleDto, actingUserId: string) {
    const existing = await this.prisma.role.findUnique({
      where: { code: dto.code },
    });
    if (existing) {
      throw new ConflictException('Un rôle avec ce code existe déjà.');
    }
    const role = await this.prisma.role.create({
      data: dto,
      include: ROLE_INCLUDE,
    });

    const schoolId = await this.schoolService.getDefaultId();
    await this.auditService.log({
      schoolId,
      userId: actingUserId,
      action: 'ROLE_CREATE',
      entite: 'Role',
      entiteId: role.id,
      nouvelleValeur: role,
    });

    return this.mapRole(role);
  }

  async update(id: string, dto: UpdateRoleDto, actingUserId: string) {
    const before = await this.findOne(id);
    const role = await this.prisma.role.update({
      where: { id },
      data: dto,
      include: ROLE_INCLUDE,
    });

    const schoolId = await this.schoolService.getDefaultId();
    await this.auditService.log({
      schoolId,
      userId: actingUserId,
      action: 'ROLE_UPDATE',
      entite: 'Role',
      entiteId: id,
      ancienneValeur: before,
      nouvelleValeur: role,
    });

    return this.mapRole(role);
  }

  async setPermissions(
    id: string,
    dto: SetRolePermissionsDto,
    actor: CurrentUserData,
  ) {
    const actingUserId = actor.id;
    const before = await this.findOne(id);

    // Ce qui change (ajouté ou retiré) : si c'est un droit réservé à la Direction que l'acteur ne détient pas,
    // refus. Sans cela, l'Administrateur pourrait s'accorder l'approbation des remises ou des sorties.
    const wanted = new Set(dto.permissionCodes);
    const current = new Set(before.permissions);
    const changed = [
      ...dto.permissionCodes.filter((code) => !current.has(code)),
      ...before.permissions.filter((code) => !wanted.has(code)),
    ];
    assertCanHandleReserved(
      actor.permissions,
      changed,
      'modifier ces permissions',
    );

    const permissions = await this.prisma.permission.findMany({
      where: { code: { in: dto.permissionCodes } },
    });
    if (permissions.length !== dto.permissionCodes.length) {
      const found = new Set(permissions.map((p) => p.code));
      const unknown = dto.permissionCodes.filter((code) => !found.has(code));
      throw new BadRequestException(
        `Permission(s) inconnue(s) : ${unknown.join(', ')}.`,
      );
    }

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId: id } }),
      this.prisma.rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId: id,
          permissionId: permission.id,
        })),
      }),
    ]);

    const after = await this.findOne(id);

    const schoolId = await this.schoolService.getDefaultId();
    await this.auditService.log({
      schoolId,
      userId: actingUserId,
      action: 'ROLE_PERMISSIONS_UPDATE',
      entite: 'Role',
      entiteId: id,
      ancienneValeur: before.permissions,
      nouvelleValeur: after.permissions,
    });

    return after;
  }

  private mapRole(role: RoleWithPermissions) {
    const { rolePermissions, ...rest } = role;
    return {
      ...rest,
      permissions: rolePermissions.map((rp) => rp.permission.code),
    };
  }
}
