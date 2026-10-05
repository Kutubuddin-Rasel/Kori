export interface SendOtpResponse {
  readonly message: string;
  readonly expiresIn?: number;
  readonly challengeId: string;
}

export interface RegistrationAuthorizationResponse {
  readonly token: string;
  readonly expiresIn: number;
}

export interface VerifyOtpResponse {
  readonly message: string;
  readonly isRegistered: boolean;
  readonly registrationAuthorization?: RegistrationAuthorizationResponse;
}

export interface OtpChallenge {
  readonly phone: string;
  readonly deviceId: string;
  readonly code: string;
}

export type OtpVerificationStatus =
  | 'VERIFIED'
  | 'TOO_MANY_ATTEMPTS'
  | 'NO_ACTIVE_CHALLENGE'
  | 'SUPERSEDED'
  | 'CHALLENGE_MISSING'
  | 'INVALID_CHALLENGE'
  | 'INVALID_OTP';
