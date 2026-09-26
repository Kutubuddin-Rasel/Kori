import { divideRoundHalfEven } from '../utils/round-half-even';

describe('divideRoundHalfEven', () => {
  // =========================================================================
  // STANDARD ROUNDING (Non-Tie Scenarios)
  // =========================================================================

  it('rounds down when below half', () => {
    // Verifies standard behavior where fractional part is < 0.5 (e.g., 2.4 -> 2).
    expect(divideRoundHalfEven(24n, 10n)).toBe(2n);
    // e.g., 3.2 -> 3
    expect(divideRoundHalfEven(32n, 10n)).toBe(3n);
  });

  it('rounds up when above half', () => {
    // Verifies standard behavior where fractional part is > 0.5 (e.g., 2.6 -> 3).
    expect(divideRoundHalfEven(26n, 10n)).toBe(3n);
    // e.g., 3.8 -> 4
    expect(divideRoundHalfEven(38n, 10n)).toBe(4n);
  });

  // =========================================================================
  // TIE-BREAKING (Banker's Rounding: .5 Scenarios)
  // =========================================================================

  it('stays (rounds down) on an even tie', () => {
    // When exactly half and the preceding digit is even, it should round down to stay even.
    // e.g., 2.5 -> 2 (since 2 is even)
    expect(divideRoundHalfEven(25n, 10n)).toBe(2n);
    // e.g., 4.5 -> 4 (since 4 is even)
    expect(divideRoundHalfEven(45n, 10n)).toBe(4n);
  });

  it('rounds up to even on an odd tie', () => {
    // When exactly half and the preceding digit is odd, it should round up to become even.
    // This minimizes cumulative rounding errors across large datasets (Banker's Rounding).
    // e.g., 3.5 -> 4 (since 3 is odd, round up to 4)
    expect(divideRoundHalfEven(35n, 10n)).toBe(4n);
    // e.g., 1.5 -> 2 (since 1 is odd, round up to 2)
    expect(divideRoundHalfEven(15n, 10n)).toBe(2n);
  });

  // =========================================================================
  // BUSINESS DOMAIN USE CASES
  // =========================================================================

  it('handles the Kori business example correctly (Cash Out fee)', () => {
    // Validates the specific Kori fee calculation logic:
    // Cash Out amount: 5000 poisha
    // Fee rate: 1.85% (185 / 10000)
    // Precise calculation: 5000 * (185 / 10000) = 925000 / 10000 = 92.5 poisha.
    // Since 92 is even, 92.5 exactly ties and must round down to stay even -> 92 poisha.
    const principal = 5000n;
    const rateNumerator = 185n;
    const rateDenominator = 10000n;

    const feeNumerator = principal * rateNumerator;

    expect(divideRoundHalfEven(feeNumerator, rateDenominator)).toBe(92n);
  });
});
