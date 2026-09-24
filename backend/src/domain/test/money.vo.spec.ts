import { InvalidMoneyException } from '../exceptions/invalid-money.exception';
import { Money } from '../value-objects/money.vo';

describe('Money', () => {
  it('create a money value object from 0 minor units', () => {
    const money = Money.fromMinorUnits(0n);

    expect(money.minorUnits).toBe(0n);
  });

  it('create a money value object from a valid minor units', () => {
    const money = Money.fromMinorUnits(1490n);

    expect(money.minorUnits).toBe(1490n);
  });

  it('reject a negative minor units', () => {
    expect(() => Money.fromMinorUnits(-1n)).toThrow(InvalidMoneyException);
  });

  it('create a money value object when minor units equal max minor units', () => {
    const money = Money.fromMinorUnits(9_223_372_036_854_775_807n);

    expect(money.minorUnits).toBe(9_223_372_036_854_775_807n);
  });

  it('reject when minor units become larger than max minor units', () => {
    expect(() => Money.fromMinorUnits(9_223_372_036_854_775_808n)).toThrow(
      InvalidMoneyException,
    );
  });

  it('compare money value objects by minor units', () => {
    const moneyA = Money.fromMinorUnits(1490n);
    const moneyB = Money.fromMinorUnits(1490n);

    expect(moneyA.equals(moneyB)).toBe(true);
  });

  it('add valid minor units to a money value object', () => {
    const money = Money.fromMinorUnits(1490n);
    const newMoney = money.add(Money.fromMinorUnits(10n));

    expect(newMoney.minorUnits).toBe(1500n);
  });

  it('reject when try to add and that become larger than max minor units', () => {
    const money = Money.fromMinorUnits(9_223_372_036_854_775_807n);

    expect(() => money.add(Money.fromMinorUnits(1n))).toThrow(
      InvalidMoneyException,
    );
  });

  it('money is zero', () => {
    const money = Money.zero();
    expect(money.isZero()).toBe(true);
  });

  it('compare one minor units is less than another', () => {
    const moneyA = Money.fromMinorUnits(10n);
    const moneyB = Money.fromMinorUnits(9n);

    expect(moneyB.isLessThan(moneyA)).toBe(true);
  });

  it('preserves the domain exception type', () => {
    const error = new InvalidMoneyException('invalid');
    expect(error).toBeInstanceOf(InvalidMoneyException);
    expect(error).toBeInstanceOf(Error);
  });
});
