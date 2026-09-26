import { InvalidPhoneNumberException } from '../exceptions/invalid-phone-number.exception';
import { PhoneNumber } from '../value-objects/phone-number.vo';

describe('PhoneNumber Value Object', () => {
  // =========================================================================
  // NORMALIZATION & INSTANTIATION
  // =========================================================================

  it('normalizes a local Bangladeshi phone number to E.164', () => {
    // Business rule: Numbers entered in local format (01X...) must be standardized
    // to international E.164 format (+880...) for database storage and SMS routing.
    const phone = PhoneNumber.from('01712345678');
    expect(phone.value).toBe('+8801712345678');
  });

  it('keeps an E.164 Bangladeshi phone number canonical', () => {
    // If a number is already perfectly formatted, it should remain unchanged.
    const phone = PhoneNumber.from('+8801712345678');
    expect(phone.value).toBe('+8801712345678');
  });

  // =========================================================================
  // EQUALITY (Value Object Semantics)
  // =========================================================================

  it('treats equivalent representations as equal', () => {
    // Core Value Object invariant: Two phone numbers are identical if their canonical
    // underlying representations match, even if originally instantiated with different formats.
    const phoneA = PhoneNumber.from('01712345678');
    const phoneB = PhoneNumber.from('+8801712345678');

    expect(phoneA.equals(phoneB)).toBe(true);
  });

  // =========================================================================
  // VALIDATION & INVARIANTS
  // =========================================================================

  it('rejects an invalid phone number', () => {
    // Security/Domain rule: Malformed, overly short, or random string inputs
    // must be strongly rejected to prevent junk data.
    expect(() => PhoneNumber.from('12345')).toThrow(
      InvalidPhoneNumberException,
    );
  });

  it('rejects a phone number from another country', () => {
    // Domain restriction: The Kori system currently only supports Bangladeshi numbers.
    // +1 (US) or other country codes must be strictly blocked.
    expect(() => PhoneNumber.from('+14155552671')).toThrow(
      InvalidPhoneNumberException,
    );
  });

  // =========================================================================
  // EXCEPTION HANDLING
  // =========================================================================

  it('preserves the domain exception type', () => {
    // Ensure error inheritance is intact so upstream layers (like error filters)
    // can reliably catch this as a Domain-level issue.
    const error = new InvalidPhoneNumberException('invalid');

    expect(error).toBeInstanceOf(InvalidPhoneNumberException);
    expect(error).toBeInstanceOf(Error);
  });
});
