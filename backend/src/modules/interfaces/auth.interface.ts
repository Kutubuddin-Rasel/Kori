export interface SendOtpResponse {
  message: string;
  expiresIn?: number;
}

export interface VerifyOtpResponse {
  message: string;
  isRegistered: boolean;
}

export interface TokensResponse {
  accessToken: string;
  refreshToken: string;
}

export interface TokenResponse {
  accessToken: string;
}
