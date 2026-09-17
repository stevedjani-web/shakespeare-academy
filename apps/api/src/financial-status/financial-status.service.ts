import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SchoolService } from '../school/school.service';
import { StudentsService } from '../students/students.service';
import { computeApprovedDiscountAmount } from '../discounts/discount-amount.util';

export type SolvencyStatus = 'SOLVABLE' | 'A_ECHOIR' | 'EN_RETARD' | 'IMPAYE_CRITIQUE' | 'EXONERE';

interface DueLine {
  invoiceId: string;
  invoiceLineId: string;
  libelle: string;
  solde: number;
  dateLimite: Date;
}

/**
 * Calcule le statut de solvabilité d'un élève (cahier §6) — jamais une donnée saisie, toujours
 * dérivée. "Montant payé" (Lot 4) somme les `Payment` réellement `VALIDE` de chaque ligne — un
 * paiement `ANNULE` (RG09 : correction, jamais une suppression) n'est jamais compté.
 */
@Injectable()
export class FinancialStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schoolService: SchoolService,
    private readonly studentsService: StudentsService,
  ) {}

  async getForStudent(studentId: string) {
    await this.studentsService.findOne(studentId);
    const schoolId = await this.schoolService.getDefaultId();
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: schoolId } });

    const invoices = await this.prisma.invoice.findMany({
      where: {
        schoolId,
        statut: 'EMISE',
        enrollment: { studentId },
      },
      include: {
        lines: { include: { discounts: true, payments: { where: { statut: 'VALIDE' } } } },
      },
    });

    const now = new Date();
    let montantFacture = 0;
    let montantRemise = 0;
    let montantPaye = 0;
    let montantExigible = 0;
    let montantAEchoir = 0;
    const lignesEnRetard: DueLine[] = [];
    const echeancesAVenir: DueLine[] = [];

    for (const invoice of invoices) {
      for (const line of invoice.lines) {
        montantFacture += line.montant;
        const remiseApprouvee = computeApprovedDiscountAmount(line, line.discounts);
        montantRemise += remiseApprouvee;
        const paye = line.payments.reduce((sum, p) => sum + p.montant, 0);
        montantPaye += paye;
        const solde = line.montant - remiseApprouvee - paye;
        if (solde <= 0) continue;

        const baseDate = line.dateEcheance ?? invoice.dateEmission;
        const dateLimiteEffective = new Date(baseDate);
        dateLimiteEffective.setDate(dateLimiteEffective.getDate() + line.delaiGraceJours);

        const entry: DueLine = {
          invoiceId: invoice.id,
          invoiceLineId: line.id,
          libelle: line.libelle,
          solde,
          dateLimite: dateLimiteEffective,
        };

        if (dateLimiteEffective < now) {
          montantExigible += solde;
          lignesEnRetard.push(entry);
        } else {
          montantAEchoir += solde;
          echeancesAVenir.push(entry);
        }
      }
    }

    const montantRestant = montantExigible + montantAEchoir;

    let statut: SolvencyStatus;
    if (montantFacture === 0) {
      statut = 'SOLVABLE';
    } else if (montantRestant === 0) {
      statut = montantRemise >= montantFacture ? 'EXONERE' : 'SOLVABLE';
    } else if (montantExigible > 0) {
      statut =
        school.seuilImpayeCritiqueFcfa != null && montantExigible > school.seuilImpayeCritiqueFcfa
          ? 'IMPAYE_CRITIQUE'
          : 'EN_RETARD';
    } else {
      statut = 'A_ECHOIR';
    }

    lignesEnRetard.sort((a, b) => a.dateLimite.getTime() - b.dateLimite.getTime());
    echeancesAVenir.sort((a, b) => a.dateLimite.getTime() - b.dateLimite.getTime());
    const prochaineEcheance = [...lignesEnRetard, ...echeancesAVenir][0] ?? null;

    return {
      statut,
      montantFacture,
      montantRemise,
      montantPaye,
      montantRestant,
      montantExigible,
      montantAEchoir,
      prochaineEcheance: prochaineEcheance
        ? {
            libelle: prochaineEcheance.libelle,
            montant: prochaineEcheance.solde,
            dateLimite: prochaineEcheance.dateLimite,
            enRetard: prochaineEcheance.dateLimite < now,
          }
        : null,
      lignesEnRetard: lignesEnRetard.map((l) => ({
        invoiceId: l.invoiceId,
        invoiceLineId: l.invoiceLineId,
        libelle: l.libelle,
        montant: l.solde,
        dateLimite: l.dateLimite,
      })),
    };
  }
}
