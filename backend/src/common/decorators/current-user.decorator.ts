import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RefreshTokenPayload } from 'src/modules/auth/interfaces/jwt.interface';

interface RequestWithUser extends RefreshTokenPayload {
  user: RefreshTokenPayload;
}
/**
 * * Custom decorator to extract the current user's information from the request object.
 * It can return either the entire user object or a specific property of the user based on the provided data.
 *
 * @param data - An optional key of the RefreshTokenPayload to specify which property of the user to return.
 * @param ctx - The execution context, which allows access to the request object.
 * @returns The user's information or a specific property of the user based on the provided data.
 */
export const CurrentUser = createParamDecorator(
  (data: keyof RefreshTokenPayload | undefined, ctx: ExecutionContext) => {
    // Switch to the HTTP context and get the request object, which is expected to have a 'user' property containing the user's information
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    // If data is provided, return the specific property of the user; otherwise, return the entire user object
    return data ? user?.[data] : user;
  },
);
