export interface IssuedAuthorization {
  readonly token: string;
  readonly expiresIn: number;
}

export interface RegistrationAuthorizationState {
  readonly tokenHash: string;
  readonly phone: string;
  readonly deviceId: string;
}

export interface DeviceEnrollmentAuthorizationState {
  readonly tokenHash: string;
  readonly userId: string;
  readonly phone: string;
  readonly deviceId: string;
}

export type AuthorizationConsumeStatus = 'CONSUMED' | 'MISSING' | 'INVALID';
