import { Role } from 'generated/prisma/enums';

export interface JwtPayload {
  sub: string;
  phone: string;
  role: Role;
  deviceId: string;
}

export interface AccessTokenPayload {
  sub: string;
  role: string;
}

export interface AuthCookie {
  refresh_token?: string;
}
