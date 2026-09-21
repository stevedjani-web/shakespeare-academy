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
import { CalendarService } from './calendar.service';
import {
  CreateCalendarEventDto,
  CreateTermDto,
  UpdateCalendarEventDto,
  UpdateTermDto,
} from './dto/pedagogy.dto';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/types/current-user.interface';

@Controller('terms')
export class TermsController {
  constructor(private readonly calendar: CalendarService) {}

  @Get()
  list(@Query('academicYearId') academicYearId?: string) {
    return this.calendar.listTerms(academicYearId);
  }

  @Post()
  @RequirePermission('PEDAGOGY_MANAGE')
  create(@Body() dto: CreateTermDto, @CurrentUser() user: CurrentUserData) {
    return this.calendar.createTerm(dto, user.id);
  }

  @Patch(':id')
  @RequirePermission('PEDAGOGY_MANAGE')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTermDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.calendar.updateTerm(id, dto, user.id);
  }

  @Delete(':id')
  @RequirePermission('PEDAGOGY_MANAGE')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.calendar.deleteTerm(id, user.id);
  }
}

@Controller('calendar-events')
export class CalendarEventsController {
  constructor(private readonly calendar: CalendarService) {}

  @Get()
  list(@Query('academicYearId') academicYearId?: string) {
    return this.calendar.listEvents(academicYearId);
  }

  @Post()
  @RequirePermission('PEDAGOGY_MANAGE')
  create(
    @Body() dto: CreateCalendarEventDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.calendar.createEvent(dto, user.id);
  }

  @Patch(':id')
  @RequirePermission('PEDAGOGY_MANAGE')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCalendarEventDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.calendar.updateEvent(id, dto, user.id);
  }

  @Delete(':id')
  @RequirePermission('PEDAGOGY_MANAGE')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.calendar.deleteEvent(id, user.id);
  }
}
