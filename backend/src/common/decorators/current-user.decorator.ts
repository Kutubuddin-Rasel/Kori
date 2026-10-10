import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AccessTokenPayload,
  RefreshTokenPayload,
} from 'src/modules/auth/interfaces/jwt.interface';

type AuthenticatedPrincipal = AccessTokenPayload | RefreshTokenPayload;
type PrincipalField = keyof AccessTokenPayload | keyof RefreshTokenPayload;

/**
 * Interface representing an HTTP request that has been authenticated,
 * containing the user's principal information.
 */
interface AuthenticatedRequest {
  user?: AuthenticatedPrincipal;
}

/**
 * * Custom decorator to extract the current user's information from the request object.
 * It can return either the entire user object or a specific property of the user based on the provided data.
 *
 * @param field - An optional key of the `PrincipalField` to specify which property of the user to return.
 * @param ctx - The execution context, which allows access to the request object.
 * @returns The user's information or a specific property of the user based on the provided data.
 */
export const CurrentUser = createParamDecorator(
  (field: PrincipalField | undefined, ctx: ExecutionContext) => {
    // Switch to the HTTP context and get the request object, which is expected to have a 'user' property containing the user's information
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    if (field === undefined) {
      return user;
    }

    if (!Object.hasOwn(user, field)) {
      throw new InternalServerErrorException(
        'Requested authentication claim is unavailable.',
      );
    }

    return (user as unknown as Record<string, unknown>)[field];
  },
);
