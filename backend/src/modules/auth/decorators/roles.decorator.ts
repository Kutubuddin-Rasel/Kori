import { SetMetadata } from '@nestjs/common';
import { Role } from 'generated/prisma/enums';

/*
 This file defines a custom decorator called `Roles` that is used to specify the roles required to access certain routes or controllers in a NestJS application. The `ROLES_KEY` constant is used as a key to store the roles metadata, and the `Roles` function takes a variable number of `Role` arguments and uses the `SetMetadata` function to associate those roles with the specified key. This allows for role-based access control in the application.
 */
export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
