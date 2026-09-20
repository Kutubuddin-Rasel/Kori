export class InvalideWalletIdException extends Error {
  constructor(message: string) {
    super(message);
    this.name = InvalideWalletIdException.name;
    Object.setPrototypeOf(this, InvalideWalletIdException.prototype);
  }
}
