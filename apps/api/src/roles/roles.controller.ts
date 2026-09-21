import { Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { SetRolePermissionsDto } from './dto/set-role-permissions.dto';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/types/current-user.interface';

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  // Lecture ouverte à tout utilisateur authentifié : nécessaire pour peupler un sélecteur de rôle
  // à la création d'un utilisateur (USER_MANAGE), sans donner pour autant le droit de les modifier.
  @Get()
  findAll() {
    return this.rolesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rolesService.findOne(id);
  }

  @Post()
  @RequirePermission('ROLE_MANAGE')
  create(@Body() dto: CreateRoleDto, @CurrentUser() user: CurrentUserData) {
    return this.rolesService.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermission('ROLE_MANAGE')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.rolesService.update(id, dto, user.id);
  }

  @Put(':id/permissions')
  @RequirePermission('ROLE_MANAGE')
  setPermissions(
    @Param('id') id: string,
    @Body() dto: SetRolePermissionsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.rolesService.setPermissions(id, dto, user);
  }
}
