import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SchoolService } from '../school/school.service';

const newToken = () => randomBytes(18).toString('base64url');

/**
 * QR codes de pointage : un par salle et un pour l'entrée de l'école. Les jetons ne quittent jamais ces
 * routes de gestion : un enseignant qui pourrait les lire à distance pointerait sans être sur place.
 */
@Injectable()
export class PointageCodesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly school: SchoolService,
  ) {}

  private async log(userId: string, action: string, entiteId: string, nouvelleValeur?: unknown) {
    await this.audit.log({
      schoolId: await this.school.getDefaultId(),
      userId,
      action,
      entite: 'PointageCode',
      entiteId,
      ancienneValeur: null,
      nouvelleValeur, // jamais le jeton lui-même
    });
  }

  /** Codes à imprimer : l'entrée, puis chaque salle active (avec ou sans code encore généré). */
  async list() {
    const [rooms, codes] = await Promise.all([
      this.prisma.room.findMany({ where: { actif: true }, orderBy: { nom: 'asc' } }),
      this.prisma.pointageCode.findMany(),
    ]);
    const gate = codes.find((c) => c.roomId === null);
    return [
      { type: 'ENTREE' as const, roomId: null, nom: "Entrée de l'école", token: gate?.token ?? null },
      ...rooms.map((r) => ({
        type: 'SALLE' as const,
        roomId: r.id,
        nom: r.nom,
        token: codes.find((c) => c.roomId === r.id)?.token ?? null,
      })),
    ];
  }

  /** Crée les codes qui manquent (entrée et salles actives) sans toucher à ceux déjà imprimés. */
  async generateMissing(userId: string) {
    const rooms = await this.prisma.room.findMany({ where: { actif: true } });
    const codes = await this.prisma.pointageCode.findMany();
    let created = 0;
    if (!codes.some((c) => c.roomId === null)) {
      await this.prisma.pointageCode.create({ data: { token: newToken() } });
      created += 1;
    }
    for (const room of rooms) {
      if (!codes.some((c) => c.roomId === room.id)) {
        await this.prisma.pointageCode.create({ data: { roomId: room.id, token: newToken() } });
        created += 1;
      }
    }
    await this.log(userId, 'POINTAGE_CODES_GENERATE', 'pointage', { crees: created });
    return this.list();
  }

  /** Remplace le jeton d'un code : l'ancien QR affiché cesse immédiatement de fonctionner. */
  async rotate(roomId: string | undefined, userId: string) {
    if (roomId) {
      const room = await this.prisma.room.findUnique({ where: { id: roomId } });
      if (!room) throw new NotFoundException('Salle introuvable.');
      const existing = await this.prisma.pointageCode.findUnique({ where: { roomId } });
      if (existing) await this.prisma.pointageCode.update({ where: { id: existing.id }, data: { token: newToken() } });
      else await this.prisma.pointageCode.create({ data: { roomId, token: newToken() } });
      await this.log(userId, 'POINTAGE_CODE_ROTATE', roomId, { salle: room.nom });
    } else {
      const gate = await this.prisma.pointageCode.findFirst({ where: { roomId: null } });
      if (gate) await this.prisma.pointageCode.update({ where: { id: gate.id }, data: { token: newToken() } });
      else await this.prisma.pointageCode.create({ data: { token: newToken() } });
      await this.log(userId, 'POINTAGE_CODE_ROTATE', 'entree', { entree: true });
    }
    return this.list();
  }

  /** Ce que désigne un jeton scanné : une salle ou l'entrée. Inconnu ou remplacé : introuvable. */
  async resolve(token: string) {
    const code = await this.prisma.pointageCode.findUnique({ where: { token }, include: { room: true } });
    if (!code) {
      throw new NotFoundException('QR code inconnu ou remplacé. Demandez à la vie scolaire le QR à jour.');
    }
    return code;
  }
}
