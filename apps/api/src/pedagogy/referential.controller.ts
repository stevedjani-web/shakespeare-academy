import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ReferentialService } from './referential.service';
import {
  CreateRoomDto,
  CreateSubjectDto,
  CreateTimeSlotDto,
  SetSubjectLevelsDto,
  UpdateRoomDto,
  UpdateSubjectDto,
  UpdateTimeSlotDto,
} from './dto/pedagogy.dto';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/types/current-user.interface';

// Lecture ouverte à tout utilisateur connecté (données non personnelles, utiles aux futurs écrans
// enseignants et parents) ; toute écriture exige PEDAGOGY_MANAGE.

@Controller('time-slots')
export class TimeSlotsController {
  constructor(private readonly referential: ReferentialService) {}

  @Get()
  list(@Query('sectionId') sectionId?: string) {
    return this.referential.listTimeSlots(sectionId);
  }

  @Post()
  @RequirePermission('PEDAGOGY_MANAGE')
  create(@Body() dto: CreateTimeSlotDto, @CurrentUser() user: CurrentUserData) {
    return this.referential.createTimeSlot(dto, user.id);
  }

  @Patch(':id')
  @RequirePermission('PEDAGOGY_MANAGE')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTimeSlotDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.referential.updateTimeSlot(id, dto, user.id);
  }

  @Delete(':id')
  @RequirePermission('PEDAGOGY_MANAGE')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.referential.deleteTimeSlot(id, user.id);
  }
}

@Controller('rooms')
export class RoomsController {
  constructor(private readonly referential: ReferentialService) {}

  @Get()
  list() {
    return this.referential.listRooms();
  }

  @Post()
  @RequirePermission('PEDAGOGY_MANAGE')
  create(@Body() dto: CreateRoomDto, @CurrentUser() user: CurrentUserData) {
    return this.referential.createRoom(dto, user.id);
  }

  @Patch(':id')
  @RequirePermission('PEDAGOGY_MANAGE')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRoomDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.referential.updateRoom(id, dto, user.id);
  }

  @Delete(':id')
  @RequirePermission('PEDAGOGY_MANAGE')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.referential.deleteRoom(id, user.id);
  }
}

@Controller('subjects')
export class SubjectsController {
  constructor(private readonly referential: ReferentialService) {}

  @Get()
  list() {
    return this.referential.listSubjects();
  }

  @Post()
  @RequirePermission('PEDAGOGY_MANAGE')
  create(@Body() dto: CreateSubjectDto, @CurrentUser() user: CurrentUserData) {
    return this.referential.createSubject(dto, user.id);
  }

  @Patch(':id')
  @RequirePermission('PEDAGOGY_MANAGE')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSubjectDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.referential.updateSubject(id, dto, user.id);
  }

  @Put(':id/levels')
  @RequirePermission('PEDAGOGY_MANAGE')
  setLevels(
    @Param('id') id: string,
    @Body() dto: SetSubjectLevelsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.referential.setSubjectLevels(id, dto, user.id);
  }

  @Delete(':id')
  @RequirePermission('PEDAGOGY_MANAGE')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.referential.deleteSubject(id, user.id);
  }
}
