import { InvalidMoneyException } from '../exceptions/invalid-money.exception';
import { Money } from '../value-objects/money.vo';

describe('Money Value Object', () => {
  // =========================================================================
  // CREATION (Instantiating Money)
  // =========================================================================

  it('create a money value object from 0 minor units', () => {
    // Validates the business rule that a zero amount is a perfectly valid state.
    const money = Money.fromMinorUnits(0n);

    expect(money.minorUnits).toBe(0n);
  });

  it('create a money value object from a valid minor units', () => {
    // Validates that standard positive monetary amounts can be instantiated.
    const money = Money.fromMinorUnits(1490n);

    expect(money.minorUnits).toBe(1490n);
  });

  it('reject a negative minor units', () => {
    // Business rule: Money cannot be negative in this domain.
    // Throws a domain exception if it violates this invariant.
    expect(() => Money.fromMinorUnits(-1n)).toThrow(InvalidMoneyException);
  });

  it('create a money value object when minor units equal max minor units', () => {
    // Verifies the upper boundary condition (9,223,372,036,854,775,807 is max Int64).
    const money = Money.fromMinorUnits(9_223_372_036_854_775_807n);

    expect(money.minorUnits).toBe(9_223_372_036_854_775_807n);
  });

  it('reject when minor units become larger than max minor units', () => {
    // Verifies that values exceeding Int64 max limit are safely caught to prevent overflow issues in persistence.
    expect(() => Money.fromMinorUnits(9_223_372_036_854_775_808n)).toThrow(
      InvalidMoneyException,
    );
  });

  // =========================================================================
  // EQUALITY & COMPARISON
  // =========================================================================

  it('compare money value objects by minor units', () => {
    // Value objects must be compared by their properties (structural equality), not by reference.
    const moneyA = Money.fromMinorUnits(1490n);
    const moneyB = Money.fromMinorUnits(1490n);

    expect(moneyA.equals(moneyB)).toBe(true);
  });

  it('does not treat different amounts as equal', () => {
    // Structural equality should fail if the underlying amounts differ.
    const a = Money.fromMinorUnits(100n);
    const b = Money.fromMinorUnits(101n);

    expect(a.equals(b)).toBe(false);
  });

  it('compare one minor units is less than another', () => {
    // Verifies numeric comparison operations for domain logic like sufficient balance checks.
    const moneyA = Money.fromMinorUnits(10n);
    const moneyB = Money.fromMinorUnits(9n);

    expect(moneyB.isLessThan(moneyA)).toBe(true);
  });

  // =========================================================================
  // ARITHMETIC OPERATIONS
  // =========================================================================

  it('add valid minor units to a money value object', () => {
    // Validates addition invariant. Money is immutable, so it should return a *new* Money instance.
    const money = Money.fromMinorUnits(1490n);
    const newMoney = money.add(Money.fromMinorUnits(10n));

    expect(newMoney.minorUnits).toBe(1500n);
  });

  it('reject when try to add and that become larger than max minor units', () => {
    // Overflow protection: Adding to the max allowed limit should throw an exception.
    const money = Money.fromMinorUnits(9_223_372_036_854_775_807n);

    expect(() => money.add(Money.fromMinorUnits(1n))).toThrow(
      InvalidMoneyException,
    );
  });

  // =========================================================================
  // STATE CHECKS
  // =========================================================================

  it('money is zero', () => {
    // Domain helper to cleanly check for empty funds.
    const money = Money.zero();
    expect(money.isZero()).toBe(true);
  });

  it('reports positive money', () => {
    // Domain helper to cleanly check if an amount is strictly greater than zero.
    const money = Money.fromMinorUnits(1n);

    expect(money.isPositive()).toBe(true);
  });

  // =========================================================================
  // EXCEPTION HANDLING
  // =========================================================================

  it('preserves the domain exception type', () => {
    // Ensures exceptions are correctly typed so they can be caught by Domain exception filters.
    const error = new InvalidMoneyException('invalid');
    expect(error).toBeInstanceOf(InvalidMoneyException);
    expect(error).toBeInstanceOf(Error);
  });
});
