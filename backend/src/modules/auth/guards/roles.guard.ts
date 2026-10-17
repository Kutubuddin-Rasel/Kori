import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from 'src/domain/enums';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { CurrentAccountRequest } from '../interfaces/active-account.interface';

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

    const request = context.switchToHttp().getRequest<CurrentAccountRequest>();

    const currentUser = request.currentAccount;

    if (!currentUser) {
      throw new ForbiddenException('Current account authorization is missing.');
    }

    // Check if the user's role is included in the required roles for the route.
    const hasRole = requiredRoles.includes(currentUser.role);

    if (!hasRole) {
      throw new ForbiddenException(
        `Access denied. Requires role one of these roles ${requiredRoles.join(',')} `,
      );
    }
    return true;
  }
}
