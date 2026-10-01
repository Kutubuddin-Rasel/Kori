export class TooManyRequestsException extends Error {
  constructor(message: string) {
    super(message);
    this.name = TooManyRequestsException.name;
  }
}
