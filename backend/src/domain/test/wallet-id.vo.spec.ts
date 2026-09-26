import { InvalidWalletIdException } from '../exceptions/invalid-wallet-id.exception';
import { WalletId } from '../value-objects/wallet-id.vo';

describe('WalletId Value Object', () => {
  // =========================================================================
  // INSTANTIATION
  // =========================================================================

  it('creates a wallet id from a valid value', () => {
    // Happy path: A standard alphanumeric or uuid string should successfully become a WalletId.
    const id = WalletId.from('wallet-1');

    expect(id.value).toBe('wallet-1');
  });

  // =========================================================================
  // VALIDATION & INVARIANTS
  // =========================================================================

  it('rejects an empty wallet id', () => {
    // Security rule: An ID cannot be empty. Prevents routing funds to a null/void wallet.
    expect(() => WalletId.from('')).toThrow(InvalidWalletIdException);
  });

  it('rejects a whitespace-only wallet id', () => {
    // Security rule: Blank inputs of spaces are functionally equivalent to empty strings.
    expect(() => WalletId.from('   ')).toThrow(InvalidWalletIdException);
  });

  it('reject a surrounding whitespace wallet id', () => {
    // Integrity rule: Un-trimmed IDs lead to hidden bugs in database lookups.
    // We strictly reject rather than silently trimming to force clean data from upstream.
    expect(() => WalletId.from(' wallet-1 ')).toThrow(InvalidWalletIdException);
  });

  // =========================================================================
  // EQUALITY (Value Object Semantics)
  // =========================================================================

  it('compares wallet ids by value', () => {
    // Value Object rule: Equality is based on structural value, not object reference.
    const first = WalletId.from('wallet-1');
    const second = WalletId.from('wallet-1');

    expect(first.equals(second)).toBe(true);
  });

  it('return false for different wallet ids', () => {
    // Basic structural inequality check.
    const first = WalletId.from('wallet-1');
    const second = WalletId.from('wallet-2');

    expect(first.equals(second)).toBe(false);
  });
});
