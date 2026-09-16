import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import type { CurrentUserData } from '../types/current-user.interface';

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): CurrentUserData => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user: CurrentUserData }>();
    return request.user;
  },
);
