import { IsUUID } from 'class-validator';

export class DeviceIdParam {
  @IsUUID('4', { message: 'deviceId must be a valid UUID v4.' })
  deviceRecordId: string = '';
}
