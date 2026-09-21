import { InvalidWalletIdException } from '../exceptions/invalid-walletId.exception';
import { WalletId } from '../value-objects/wallet-id.vo';

describe('UserId', () => {
  it('creates a wallet id from a valid value', () => {
    const id = WalletId.from('wallet-1');

    expect(id.value).toBe('wallet-1');
  });

  it('rejects an empty wallet id', () => {
    expect(() => WalletId.from('')).toThrow(InvalidWalletIdException);
  });

  it('rejects a whitespace-only wallet id', () => {
    expect(() => WalletId.from('   ')).toThrow(InvalidWalletIdException);
  });

  it('reject a surrounding whitespace wallet id', () => {
    expect(() => WalletId.from(' wallet-1 ')).toThrow(InvalidWalletIdException);
  });

  it('compares wallet ids by value', () => {
    const first = WalletId.from('wallet-1');
    const second = WalletId.from('wallet-1');

    expect(first.equals(second)).toBe(true);
  });
});
