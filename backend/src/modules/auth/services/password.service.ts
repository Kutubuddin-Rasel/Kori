import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

@Injectable()
export class PasswordService {
  // Hash the password using Argon2 algorithm
  async hash(password: string): Promise<string> {
    // Use argon2id variant with recommended parameters for security and performance
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
  }

  // Verify the password against the stored hash
  async verify(password: string, hash: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }
}
