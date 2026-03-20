export interface SendOtpResponse {
  readonly message: string;
  readonly expiresIn?: number;
}

export interface VerifyOtpResponse {
  readonly message: string;
  readonly isRegistered: boolean;
}

export interface TokensResponse {
  readonly accessToken: string;
  readonly refreshToken: string;
}

export interface TokenResponse {
  readonly accessToken: string;
}
