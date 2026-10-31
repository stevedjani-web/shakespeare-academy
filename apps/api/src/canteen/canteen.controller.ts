import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CanteenService } from './canteen.service';
import { SellCanteenDto } from './dto/canteen.dto';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/types/current-user.interface';

// Vente de cantine (CANTEEN_SELL, avec reçu) et liste du jour (CANTEEN_READ, sans aucune donnée financière).
// Les droits sont posés par méthode : un droit au niveau de la classe s'ajouterait à ceux des méthodes.
@Controller('canteen')
export class CanteenController {
  constructor(private readonly canteen: CanteenService) {}

  @Get('daily')
  @RequirePermission('CANTEEN_READ')
  daily(@Query('date') date?: string) {
    return this.canteen.daily(date);
  }

  @Get('students/:studentId')
  @RequirePermission('CANTEEN_SELL')
  student(
    @Param('studentId') studentId: string,
    @Query('month') month?: string,
  ) {
    return this.canteen.studentOverview(studentId, month);
  }

  @Post('students/:studentId/sales')
  @RequirePermission('CANTEEN_SELL')
  sell(
    @Param('studentId') studentId: string,
    @Body() dto: SellCanteenDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.canteen.sell(studentId, dto, user.id);
  }
}
