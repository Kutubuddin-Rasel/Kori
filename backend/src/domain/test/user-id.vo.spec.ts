import { InvalidUserIdException } from '../exceptions/invalid-user-id.exception';
import { UserId } from '../value-objects/user-id.vo';

describe('UserId Value Object', () => {
  // =========================================================================
  // INSTANTIATION
  // =========================================================================

  it('creates a user id from a valid value', () => {
    // Happy path: A standard alphanumeric or uuid string should successfully become a UserId.
    const id = UserId.from('user-1');

    expect(id.value).toBe('user-1');
  });

  // =========================================================================
  // VALIDATION & INVARIANTS
  // =========================================================================

  it('rejects an empty user id', () => {
    // Security rule: An ID cannot be empty. Prevents mapping errors or orphaned records.
    expect(() => UserId.from('')).toThrow(InvalidUserIdException);
  });

  it('rejects a whitespace-only user id', () => {
    // Security rule: Blank inputs of spaces are functionally equivalent to empty strings.
    expect(() => UserId.from('   ')).toThrow(InvalidUserIdException);
  });

  it('reject a surrounding whitespace user id', () => {
    // Integrity rule: Un-trimmed IDs lead to hidden bugs in lookups.
    // The application should either trim beforehand or reject outright. Here we reject.
    expect(() => UserId.from(' user-1 ')).toThrow(InvalidUserIdException);
  });

  // =========================================================================
  // EQUALITY (Value Object Semantics)
  // =========================================================================

  it('compares user ids by value', () => {
    // Value Object rule: Equality is based on structural value, not object reference.
    const first = UserId.from('user-1');
    const second = UserId.from('user-1');

    expect(first.equals(second)).toBe(true);
  });

  it('return false for different user ids', () => {
    // Basic structural inequality check.
    const first = UserId.from('user-1');
    const second = UserId.from('user-2');

    expect(first.equals(second)).toBe(false);
  });
});
