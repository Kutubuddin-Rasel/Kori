import { UnauthorizedException } from '@nestjs/common';
import { RefreshTokenPayload } from '../interfaces/jwt.interface';

/**
 * RFC 4122 Section 4.4 (UUID Version 4) Validator
 * Matches: 8 hex - 4 hex - 4 hex (starts with 4) - 4 hex (starts with 8, 9, a, or b) - 12 hex
 */
const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidV4(value: unknown): value is string {
  return typeof value === 'string' && UUID_V4_REGEX.test(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function parseRefreshTokenClaims(
  payload: unknown,
): RefreshTokenPayload | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new UnauthorizedException('Invalid refresh token');
  }

  const value = payload as Record<string, unknown>;

  if (value.tokenUse !== 'refresh') {
    return null;
  }

  if (!isNonEmptyString(value.deviceId) || value.deviceId.length > 128) {
    return null;
  }

  if (!isUuidV4(value.sub) || !isUuidV4(value.sid) || !isUuidV4(value.jti)) {
    return null;
  }

  return {
    sub: value.sub,
    deviceId: value.deviceId,
    sid: value.sid,
    jti: value.jti,
    tokenUse: 'refresh',
  };
}
