import { AccountStatus } from 'src/domain/enums';

export interface AccountRestrictionResponse {
  userId: string;
  status: AccountStatus;
}
