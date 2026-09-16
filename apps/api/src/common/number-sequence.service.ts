import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * RG10 (étendue ici aux matricules et numéros d'inscription, avant même les reçus du Lot 4) :
 * un numéro généré est unique et jamais réutilisé, produit côté serveur uniquement.
 * L'upsert sur la contrainte unique (schoolId, type, scope) est une seule instruction SQL
 * (INSERT ... ON CONFLICT DO UPDATE côté Postgres) : atomique même sous accès concurrent,
 * sans verrou explicite à gérer côté application.
 */
@Injectable()
export class NumberSequenceService {
  constructor(private readonly prisma: PrismaService) {}

  async next(schoolId: string, type: string, scope = ''): Promise<number> {
    const sequence = await this.prisma.numberSequence.upsert({
      where: { schoolId_type_scope: { schoolId, type, scope } },
      create: { schoolId, type, scope, dernierNumero: 1 },
      update: { dernierNumero: { increment: 1 } },
    });
    return sequence.dernierNumero;
  }
}
