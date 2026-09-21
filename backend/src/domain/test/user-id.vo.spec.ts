import { InvalidUserIdException } from '../exceptions/invalid-user-Id.exception';
import { UserId } from '../value-objects/user-id.vo';

describe('UserId', () => {
  it('creates a user id from a valid value', () => {
    const id = UserId.from('user-1');

    expect(id.value).toBe('user-1');
  });

  it('rejects an empty user id', () => {
    expect(() => UserId.from('')).toThrow(InvalidUserIdException);
  });

  it('rejects a whitespace-only user id', () => {
    expect(() => UserId.from('   ')).toThrow(InvalidUserIdException);
  });

  it('reject a surrounding whitespace user id', () => {
    expect(() => UserId.from(' user-1 ')).toThrow(InvalidUserIdException);
  });

  it('compares user ids by value', () => {
    const first = UserId.from('user-1');
    const second = UserId.from('user-1');

    expect(first.equals(second)).toBe(true);
  });

  it('return false for different user ids', () => {
    const first = UserId.from('user-1');
    const second = UserId.from('user-2');

    expect(first.equals(second)).toBe(false);
  });
});
