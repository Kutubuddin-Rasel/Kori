import { Role } from 'generated/prisma/enums';

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
