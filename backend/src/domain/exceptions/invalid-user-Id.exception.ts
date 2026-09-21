export class InvalidUserIdException extends Error {
  constructor(message: string) {
    super(message);
    this.name = InvalidUserIdException.name;
    Object.setPrototypeOf(this, InvalidUserIdException.prototype);
  }
}
