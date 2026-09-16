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

  async create(dto: CreateUserDto, actingUserId: string) {
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

  async update(id: string, dto: UpdateUserDto, actingUserId: string) {
    const before = await this.findOne(id);
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

  async resetPassword(id: string, dto: ResetPasswordDto, actingUserId: string) {
    await this.findOne(id);
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
