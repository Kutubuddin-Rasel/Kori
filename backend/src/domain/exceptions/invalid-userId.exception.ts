export class InvalideUserIdException extends Error {
  constructor(message: string) {
    super(message);
    this.name = InvalideUserIdException.name;
    Object.setPrototypeOf(this, InvalideUserIdException.prototype);
  }
}
