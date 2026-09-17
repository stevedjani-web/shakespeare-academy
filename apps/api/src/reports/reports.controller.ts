import { Controller, Get, Query } from '@nestjs/common';
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

  @Get('insolvent-students')
  @RequirePermission('STUDENT_READ')
  getInsolventStudents() {
    return this.reportsService.getInsolventStudents();
  }
}
