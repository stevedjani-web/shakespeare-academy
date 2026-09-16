import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface LogParams {
  schoolId: string;
  userId: string | null;
  action: string;
  entite: string;
  entiteId?: string | null;
  // `unknown` plutôt que Prisma.InputJsonValue : on journalise souvent des enregistrements Prisma
  // bruts (avec des Date), sérialisés ici en JSON plutôt qu'imposer à chaque appelant de le faire.
  ancienneValeur?: unknown;
  nouvelleValeur?: unknown;
}

function toJsonInput(
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null || value === undefined) {
    return Prisma.JsonNull;
  }
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * RG15 : toutes les actions sensibles sont journalisées (utilisateur, horodatage, ancienne/nouvelle valeur).
 * Append-only par conception : ce service n'expose volontairement aucune méthode de mise à jour ou de suppression.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: LogParams): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        schoolId: params.schoolId,
        userId: params.userId,
        action: params.action,
        entite: params.entite,
        entiteId: params.entiteId ?? null,
        ancienneValeur: toJsonInput(params.ancienneValeur),
        nouvelleValeur: toJsonInput(params.nouvelleValeur),
      },
    });
  }
}
