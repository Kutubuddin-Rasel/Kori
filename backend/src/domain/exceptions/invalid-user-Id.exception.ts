export class InvalidUserIdException extends Error {
  constructor(message: string) {
    super(message);
    this.name = InvalidUserIdException.name;
  }
}
