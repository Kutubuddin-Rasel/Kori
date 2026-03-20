import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RefreshTokenPayload } from 'src/modules/auth/interfaces/jwt.interface';

interface RequestWithUser extends RefreshTokenPayload {
  user: RefreshTokenPayload;
}
export const CurrentUser = createParamDecorator(
  (data: keyof RefreshTokenPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
