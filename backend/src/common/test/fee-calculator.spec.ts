import { Money } from 'src/domain/value-objects/money.vo';
import { calculateFee } from '../utils/fee-calculator.util';
import { TransactionType } from 'src/domain/enums';

describe('CalculateFee', () => {
  it('returns the fixed 500 poisha for Send Money', () => {
    const amount = Money.fromMinorUnits(10000n);
    const fee = calculateFee(amount, TransactionType.SEND_MONEY);

    expect(fee.minorUnits).toBe(500n);
    expect(fee.currency).toBe(amount.currency);
  });

  it('settles an exact half Cash Out fee using half-even rounding', () => {
    const amount = Money.fromMinorUnits(5000n);
    const fee = calculateFee(amount, TransactionType.CASH_OUT);

    expect(fee.minorUnits).toBe(92n);
    expect(fee.currency).toBe(amount.currency);
  });

  it('rounds a Cash Out fee above half upward instead of truncating it', () => {
    const amount = Money.fromMinorUnits(5001n);
    const fee = calculateFee(amount, TransactionType.CASH_OUT);

    expect(fee.minorUnits).toBe(93n);
    expect(fee.currency).toBe(amount.currency);
  });

  it('rounds an odd Cash Out tie upward to the nearest even minor unit', () => {
    const amount = Money.fromMinorUnits(3000n);
    const fee = calculateFee(amount, TransactionType.CASH_OUT);

    expect(fee.minorUnits).toBe(56n);
    expect(fee.currency).toBe(amount.currency);
  });

  it.each([
    TransactionType.CASH_IN,
    TransactionType.PAYMENT,
    TransactionType.ADD_MONEY,
  ])('returns zero for 0 fee', (type) => {
    const amount = Money.fromMinorUnits(1000n);
    const fee = calculateFee(amount, type);

    expect(fee.isZero()).toBe(true);
    expect(fee.currency).toBe(amount.currency);
  });
});
