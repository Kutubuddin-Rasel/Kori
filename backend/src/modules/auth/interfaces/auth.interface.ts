/// This file contains the interfaces for the authentication module.

// It defines the structure of the data that is sent and received during the authentication process.

export interface TokensResponse {
  readonly accessToken: string;
  readonly refreshToken: string;
}

export interface TokenResponse {
  readonly accessToken: string;
}
