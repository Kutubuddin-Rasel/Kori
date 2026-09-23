/**
 * Domain exception - Zero framework imports
 * Extend built-in Error
 * The application layer (Use Cases) catches this and maps it to BadRequestException
 */
export class InvalidMoneyException extends Error {
  constructor(message: string) {
    super(message);
    this.name = InvalidMoneyException.name;
  }
}
