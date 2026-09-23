export class InsufficientFundsException extends Error {
  constructor(available: bigint, required: bigint) {
    super(
      `Insufficient funds: wallet has ${available}, but ${required} is required`,
    );
    this.name = InsufficientFundsException.name;
  }
}
