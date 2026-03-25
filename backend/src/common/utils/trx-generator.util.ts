import * as crypto from 'crypto';

export function generateTrxId(prefix: string = 'TX'): string {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const dateString = `${year}${month}${day}`;

  const randomHex = crypto.randomBytes(4).toString('hex').toUpperCase();

  const trxId = `${prefix}-${dateString}-${randomHex}`;
  return trxId;
}
