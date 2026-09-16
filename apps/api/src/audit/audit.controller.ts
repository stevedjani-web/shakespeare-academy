import { Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/types/current-user.interface';

@Controller('audit-logs')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermission('AUDIT_LOG_READ')
  async findAll(
    @CurrentUser() currentUser: CurrentUserData,
    @Query('userId') userId?: string,
    @Query('entite') entite?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.prisma.auditLog.findMany({
      where: {
        schoolId: currentUser.schoolId,
        userId: userId || undefined,
        entite: entite || undefined,
        createdAt: {
          gte: from ? new Date(from) : undefined,
          lte: to ? new Date(to) : undefined,
        },
      },
      include: { user: { select: { nom: true, prenom: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }
}
