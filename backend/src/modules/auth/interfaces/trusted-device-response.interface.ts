export interface TrustedDeviceResponse {
  id: string;
  deviceId: string;
  isAuthorized: boolean;
  hasActiveSession: boolean;
  createdAt: Date;
  lastUsedAt: Date;
}
