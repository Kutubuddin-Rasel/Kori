import { InvalideUserIdException } from '../exceptions/invalid-userId.exception';

/**
 * A Value Object representing a User's ID.
 * This guarantees that if a UserId object exists in the system,
 * it holds a valid, non-empty, and immutable ID string.
 */
export class UserId {
  // Private so it can't be created directly with `new UserId()`.
  // The 'readonly' keyword locks the data so it can never be altered.
  private constructor(private readonly id: string) {}

  /**
   * The only way to create a UserId.
   * It acts as a gatekeeper to ensure no bad data enters the system.
   */
  static from(value: string): UserId {
    if (value.length === 0 || value.trim().length === 0) {
      throw new InvalideUserIdException('UserId cannot be empty');
    }

    if (value !== value.trim()) {
      throw new InvalideUserIdException(
        'UserId cannot contain surrounding whitespace',
      );
    }

    return new UserId(value);
  }

  // Allows other parts of the app to read the ID, but not change it.
  get value(): string {
    return this.id;
  }

  // A helper to safely compare two UserId objects.
  equals(other: UserId): boolean {
    return other.id === this.id;
  }

  /**
   * Automatically called when the object is used as a string.
   * Useful for string interpolation (e.g., `User: ${userId}`)
   * or when logging to the console, preventing "[object Object]" output.
   */
  toString(): string {
    return this.id;
  }
}
