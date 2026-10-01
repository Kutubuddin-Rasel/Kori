export interface SendOtpResponse {
  readonly message: string;
  readonly expiresIn?: number;
  readonly challengeId: string;
}

export interface VerifyOtpResponse {
  readonly message: string;
  readonly isRegistered: boolean;
}

export interface OtpChallenge {
  readonly phone: string;
  readonly deviceId: string;
  readonly code: string;
}
