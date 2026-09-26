export function divideRoundHalfEven(
  numerator: bigint,
  denominator: bigint,
): bigint {
  const division = numerator / denominator;
  const remainder = numerator % denominator;
  const doubleRemainder = remainder * 2n;

  if (doubleRemainder < denominator) {
    return division;
  }

  if (doubleRemainder > denominator) {
    return division + 1n;
  }

  return division % 2n == 0n ? division : division + 1n;
}
