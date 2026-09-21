import { InvalideUserIdException } from '../exceptions/invalid-userId.exception';
import { UserId } from '../value-objects/user-id.vo';

describe('UserId', () => {
  it('creates a user id from a valid value', () => {
    const id = UserId.from('user-1');

    expect(id.value).toBe('user-1');
  });

  it('rejects an empty user id', () => {
    expect(() => UserId.from('')).toThrow(InvalideUserIdException);
  });

  it('rejects a whitespace-only user id', () => {
    expect(() => UserId.from('   ')).toThrow(InvalideUserIdException);
  });

  it('reject a surrounding whitespace user id', () => {
    expect(() => UserId.from(' user-1 ')).toThrow(InvalideUserIdException);
  });

  it('compares user ids by value', () => {
    const first = UserId.from('user-1');
    const second = UserId.from('user-1');

    expect(first.equals(second)).toBe(true);
  });
});
