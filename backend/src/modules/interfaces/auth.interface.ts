export interface SendOtpResponse {
  message: string;
  expiresIn?: number;
}

export interface VerifyOtpResponse {
  message: string;
  isRegistered: boolean;
}

export interface GetTokensResponse {
  accessToken: string;
  refreshToken: string;
}
