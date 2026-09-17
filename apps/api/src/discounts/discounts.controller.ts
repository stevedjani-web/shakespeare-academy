import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { DiscountsService } from './discounts.service';
import { CreateDiscountDto } from './dto/create-discount.dto';
import { RejectDiscountDto } from './dto/reject-discount.dto';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/types/current-user.interface';

@Controller('discounts')
@RequirePermission('STUDENT_READ')
export class DiscountsController {
  constructor(private readonly discountsService: DiscountsService) {}

  @Get()
  findAll(@Query('statut') statut?: string) {
    return this.discountsService.findAll(statut);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.discountsService.findOne(id);
  }

  @Post()
  @RequirePermission('ENROLLMENT_MANAGE')
  create(@Body() dto: CreateDiscountDto, @CurrentUser() user: CurrentUserData) {
    return this.discountsService.create(dto, user.id);
  }

  @Post(':id/approve')
  @RequirePermission('DISCOUNT_APPROVE')
  approve(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.discountsService.approve(id, user.id);
  }

  @Post(':id/reject')
  @RequirePermission('DISCOUNT_APPROVE')
  reject(
    @Param('id') id: string,
    @Body() dto: RejectDiscountDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.discountsService.reject(id, dto, user.id);
  }
}
