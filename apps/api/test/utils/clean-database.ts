import { PrismaClient } from '@prisma/client';

/**
 * Vide la base de test entre les suites, enfants avant parents (contraintes de clé étrangère).
 * Jamais exécuté contre autre chose que `shakespeare_academy_test` — voir test/setup-env.ts.
 */
export async function cleanDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.refreshToken.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.discount.deleteMany();
  await prisma.invoiceLine.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.installmentSchedule.deleteMany();
  await prisma.feeSchedule.deleteMany();
  await prisma.feeType.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.studentGuardian.deleteMany();
  await prisma.student.deleteMany();
  await prisma.guardian.deleteMany();
  await prisma.numberSequence.deleteMany();
  await prisma.class.deleteMany();
  await prisma.level.deleteMany();
  await prisma.cycle.deleteMany();
  await prisma.section.deleteMany();
  await prisma.academicYear.deleteMany();
  await prisma.user.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.role.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.school.deleteMany();
}
