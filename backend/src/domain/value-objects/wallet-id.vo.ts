import { InvalidWalletIdException } from '../exceptions/invalid-wallet-id.exception';

/**
 * A Value Object representing a Wallet's ID.
 * This guarantees that if a WalletId object exists in the system,
 * it holds a valid, non-empty, and immutable ID string.
 */
export class WalletId {
  // Private so it can't be created directly with `new WalletId()`.
  // The 'readonly' keyword locks the data so it can never be altered.
  private constructor(private readonly id: string) {}

  /**
   * The only way to create a WalletId.
   * It acts as a gatekeeper to ensure no bad data enters the system.
   */
  static from(value: string): WalletId {
    if (value.length === 0 || value.trim().length === 0) {
      throw new InvalidWalletIdException('Wallet ID cannot be empty');
    }

    if (value !== value.trim()) {
      throw new InvalidWalletIdException(
        'Wallet ID cannot contain surrounding whitespace',
      );
    }

    return new WalletId(value);
  }

  // Allows other parts of the app to read the ID, but not change it.
  get value(): string {
    return this.id;
  }

  // A helper to safely compare two WalletId objects.
  equals(other: WalletId): boolean {
    return this.id === other.id;
  }

  /**
   * Automatically called when the object is used as a string.
   * Useful for string interpolation (e.g., `Wallet: ${walletId}`)
   * or when logging to the console, preventing "[object Object]" output.
   */
  toString(): string {
    return this.id;
  }
}
