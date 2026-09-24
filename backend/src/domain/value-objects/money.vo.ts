import { Currency } from '../enums';
import { InvalidMoneyException } from '../exceptions/invalid-money.exception';

export class Money {
  /**
   * PostgreSQL BIGINT maximum
   * Prisma BigInt is persisted as PostgreSQL BIGINT,
   * so the domain must never create a monetary value
   * that persistence cannot represent.
   */
  private static readonly MAX_MINOR_UNITS = 9_223_372_036_854_775_807n;

  private constructor(
    private readonly amountMinorUnits: bigint,
    private readonly moneyCurrency: Currency,
  ) {}

  static fromMinorUnits(minorUnits: bigint, currency = Currency.BDT): Money {
    if (minorUnits < 0n) {
      throw new InvalidMoneyException('Money cannot be negative');
    }

    if (minorUnits > Money.MAX_MINOR_UNITS) {
      throw new InvalidMoneyException(
        'Money exceeds the supported maximum amount',
      );
    }
    return new Money(minorUnits, currency);
  }

  static zero(currency = Currency.BDT): Money {
    return Money.fromMinorUnits(0n, currency);
  }

  get minorUnits(): bigint {
    return this.amountMinorUnits;
  }

  get currency(): Currency {
    return this.moneyCurrency;
  }

  add(other: Money): Money {
    this.ensureSameCurrency(other);

    return Money.fromMinorUnits(
      this.amountMinorUnits + other.amountMinorUnits,
      this.moneyCurrency,
    );
  }

  equals(other: Money): boolean {
    return (
      this.amountMinorUnits === other.amountMinorUnits &&
      this.moneyCurrency === other.moneyCurrency
    );
  }

  isZero(): boolean {
    return this.amountMinorUnits === 0n;
  }

  isPositive(): boolean {
    return this.amountMinorUnits > 0n;
  }

  isLessThan(other: Money): boolean {
    this.ensureSameCurrency(other);
    return this.amountMinorUnits < other.amountMinorUnits;
  }

  private ensureSameCurrency(other: Money): void {
    if (this.moneyCurrency !== other.moneyCurrency) {
      throw new InvalidMoneyException(
        'Cannot operate on money with different currencies',
      );
    }
  }
}
