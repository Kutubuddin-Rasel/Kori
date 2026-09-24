import { InvalidPhoneNumberException } from '../exceptions/invalid-phone-number.exception';
import { PhoneNumber } from '../value-objects/phone-number.vo';

describe('PhoneNumber', () => {
  it('normalizes a local Bangladeshi phone number to E.164', () => {
    const phone = PhoneNumber.from('01712345678');
    expect(phone.value).toBe('+8801712345678');
  });

  it('keeps an E.164 Bangladeshi phone number canonical', () => {
    const phone = PhoneNumber.from('+8801712345678');
    expect(phone.value).toBe('+8801712345678');
  });

  it('treats equivalent representations as equal', () => {
    const phoneA = PhoneNumber.from('01712345678');
    const phoneB = PhoneNumber.from('+8801712345678');

    expect(phoneA.equals(phoneB)).toBe(true);
  });

  it('rejects an invalid phone number', () => {
    expect(() => PhoneNumber.from('12345')).toThrow(
      InvalidPhoneNumberException,
    );
  });

  it('rejects a phone number from another country', () => {
    expect(() => PhoneNumber.from('+14155552671')).toThrow(
      InvalidPhoneNumberException,
    );
  });

  it('preserves the domain exception type', () => {
    const error = new InvalidPhoneNumberException('invalid');

    expect(error).toBeInstanceOf(InvalidPhoneNumberException);

    expect(error).toBeInstanceOf(Error);
  });
});
