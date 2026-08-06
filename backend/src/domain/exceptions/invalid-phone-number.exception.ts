export class InvalidPhoneNumberException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPhoneNumberException';
    Object.setPrototypeOf(this, InvalidPhoneNumberException.prototype);
  }
}
