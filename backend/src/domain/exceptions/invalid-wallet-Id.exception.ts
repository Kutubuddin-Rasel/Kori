export class InvalidWalletIdException extends Error {
  constructor(message: string) {
    super(message);
    this.name = InvalidWalletIdException.name;
  }
}
