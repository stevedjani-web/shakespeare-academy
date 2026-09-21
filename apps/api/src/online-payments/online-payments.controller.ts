import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { OnlinePaymentsService } from './online-payments.service';
import {
  ListOnlinePaymentsQueryDto,
  ResolveOnlinePaymentDto,
} from './dto/online-payments.dto';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/types/current-user.interface';

// Suivi par le personnel des paiements faits par les parents. Lire et vérifier : FINANCE_READ. Clôturer un
// paiement reçu sans solde à imputer : approbation de la Direction (PAYMENT_CANCEL_APPROVE, réservée).
@Controller('online-payments')
export class OnlinePaymentsController {
  constructor(private readonly onlinePayments: OnlinePaymentsService) {}

  @Get()
  @RequirePermission('FINANCE_READ')
  list(@Query() query: ListOnlinePaymentsQueryDto) {
    return this.onlinePayments.list(query);
  }

  @Post(':id/reconcile')
  @HttpCode(200)
  @RequirePermission('FINANCE_READ')
  reconcile(@Param('id') id: string) {
    return this.onlinePayments.reconcile(id);
  }

  @Post(':id/resolve')
  @HttpCode(200)
  @RequirePermission('PAYMENT_CANCEL_APPROVE')
  resolve(
    @Param('id') id: string,
    @Body() dto: ResolveOnlinePaymentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.onlinePayments.resolve(id, dto, user.id);
  }
}
