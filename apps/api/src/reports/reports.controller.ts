import { Controller, Get, Header, Query } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('cash-closing')
  @RequirePermission('CASH_CLOSE')
  getCashClosing(@Query('date') date?: string) {
    return this.reportsService.getCashClosing(date || todayIsoDate());
  }

  // Insolvables, tableau de bord et leur export mêlent des montants : FINANCE_READ. Les listes d'élèves par
  // classe restent sous STUDENT_READ (aucun montant).
  @Get('insolvent-students')
  @RequirePermission('FINANCE_READ')
  getInsolventStudents() {
    return this.reportsService.getInsolventStudents();
  }

  @Get('dashboard')
  @RequirePermission('FINANCE_READ')
  getDashboardStats() {
    return this.reportsService.getDashboardStats();
  }

  @Get('students-by-class')
  @RequirePermission('STUDENT_READ')
  getStudentsByClass() {
    return this.reportsService.getStudentsByClass();
  }

  @Get('export/students')
  @RequirePermission('STUDENT_READ')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="eleves-par-classe.csv"')
  exportStudents() {
    return this.reportsService.exportStudentsByClass();
  }

  @Get('export/insolvent-students')
  @RequirePermission('FINANCE_READ')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header(
    'Content-Disposition',
    'attachment; filename="eleves-insolvables.csv"',
  )
  exportInsolventStudents() {
    return this.reportsService.exportInsolventStudents();
  }
}
