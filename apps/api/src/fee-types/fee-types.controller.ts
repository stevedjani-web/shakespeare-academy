import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { FeeTypesService } from './fee-types.service';
import { CreateFeeTypeDto } from './dto/create-fee-type.dto';
import { UpdateFeeTypeDto } from './dto/update-fee-type.dto';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/types/current-user.interface';

@Controller('fee-types')
export class FeeTypesController {
  constructor(private readonly feeTypesService: FeeTypesService) {}

  @Get()
  findAll() {
    return this.feeTypesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.feeTypesService.findOne(id);
  }

  @Post()
  @RequirePermission('FEE_MANAGE')
  create(@Body() dto: CreateFeeTypeDto, @CurrentUser() user: CurrentUserData) {
    return this.feeTypesService.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermission('FEE_MANAGE')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateFeeTypeDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.feeTypesService.update(id, dto, user.id);
  }
}
