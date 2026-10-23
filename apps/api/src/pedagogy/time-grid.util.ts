import { PrismaService } from '../prisma/prisma.service';

/** Où se trouvent les créneaux d'une classe : une grille nommée, la grille d'une section, ou la grille commune. */
export interface SlotScope {
  sectionId: string | null;
  gridId: string | null;
}

/**
 * Grille que suit un niveau : sa grille nommée si on lui en a assigné une, sinon celle de sa section quand la section en a
 * une, sinon la grille commune. Un créneau appartient à exactement une grille (`gridId`, ou `sectionId`, ou ni l'un ni l'autre).
 */
export async function slotScopeFor(
  prisma: PrismaService,
  level: { gridId: string | null },
  sectionId: string,
): Promise<SlotScope> {
  if (level.gridId) return { sectionId: null, gridId: level.gridId };
  const own = await prisma.timeSlot.count({
    where: { sectionId, gridId: null },
  });
  return own > 0
    ? { sectionId, gridId: null }
    : { sectionId: null, gridId: null };
}
