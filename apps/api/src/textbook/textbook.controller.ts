import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { TextbookService } from './textbook.service';
import {
  CreateTextbookEntryDto,
  UpdateTextbookEntryDto,
} from './dto/textbook.dto';
import {
  RequireAnyPermission,
  RequirePermission,
} from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/types/current-user.interface';

// Écrire : TEXTBOOK_WRITE (un enseignant, limité à ses affectations par le service). Lire toute l'école : TEXTBOOK_READ ;
// un enseignant lit les classes où il enseigne, sans ce droit.
@Controller('textbook')
export class TextbookController {
  constructor(private readonly textbook: TextbookService) {}

  @Get('context')
  @RequireAnyPermission('TEXTBOOK_WRITE', 'TEXTBOOK_READ')
  context(@CurrentUser() user: CurrentUserData) {
    return this.textbook.context(user);
  }

  @Get()
  @RequireAnyPermission('TEXTBOOK_WRITE', 'TEXTBOOK_READ')
  list(
    @CurrentUser() user: CurrentUserData,
    @Query('classId') classId?: string,
    @Query('subjectId') subjectId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.textbook.list(user, { classId, subjectId, from, to });
  }

  @Post()
  @RequirePermission('TEXTBOOK_WRITE')
  create(
    @Body() dto: CreateTextbookEntryDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.textbook.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission('TEXTBOOK_WRITE')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTextbookEntryDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.textbook.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermission('TEXTBOOK_WRITE')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.textbook.remove(id, user);
  }
}
