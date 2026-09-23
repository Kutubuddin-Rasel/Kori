import parsePhoneNumberFromString from 'libphonenumber-js';
import { InvalidPhoneNumberException } from '../exceptions/invalid-phone-number.exception';

export class PhoneNumber {
  private constructor(private readonly phone: string) {}

  static from(value: string): PhoneNumber {
    const input = value.trim();

    if (!input) {
      throw new InvalidPhoneNumberException('Phone number cannot be empty');
    }

    const parsed = parsePhoneNumberFromString(input, 'BD');

    if (!parsed || parsed.country !== 'BD' || !parsed.isValid()) {
      throw new InvalidPhoneNumberException('Invalid Bangladeshi phone number');
    }

    return new PhoneNumber(parsed.number);
  }

  get value(): string {
    return this.phone;
  }

  equals(other: PhoneNumber): boolean {
    return this.phone === other.phone;
  }

  toString(): string {
    return this.phone;
  }
}
