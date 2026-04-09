import { Role } from 'generated/prisma/enums';

// This file defines the interfaces for the JWT payloads and the authentication cookie used in the authentication module.
export interface RefreshTokenPayload extends AccessTokenPayload {
  readonly phone: string;
  readonly deviceId: string;
}

export interface AccessTokenPayload {
  readonly sub: string;
  readonly role: Role;
}

export interface AuthCookie {
  readonly refresh_token?: string;
}
