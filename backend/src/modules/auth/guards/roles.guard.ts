import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from 'generated/prisma/enums';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RefreshTokenPayload } from 'src/modules/auth/interfaces/jwt.interface';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  // This guard checks if the user has the required roles to access a route.
  canActivate(context: ExecutionContext): boolean {
    // Get the required roles from the route handler or controller using the custom decorator.
    // The getAllAndOverride method checks both the handler and the class for the metadata.
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no roles are required, allow access.
    if (!requiredRoles) {
      return true;
    }

    // Get the user information from the request context
    // This assumes that a previous guard (like JwtAuthGuard) has already validated the JWT and attached the user info to the request.
    const { user } = context
      .switchToHttp()
      .getRequest<{ user: RefreshTokenPayload }>();

    if (!user) {
      throw new ForbiddenException(
        'User context is missing, Ensure JwtAuthGuard is appplied first.',
      );
    }

    // Check if the user's role is included in the required roles for the route.
    const hasRole = requiredRoles.includes(user.role);

    if (!hasRole) {
      throw new ForbiddenException(
        `Access denied. Requires role one of these roles ${requiredRoles.join(',')} `,
      );
    }
    return true;
  }
}
