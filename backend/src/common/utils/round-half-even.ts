export function divideRoundHlafEven(
  numerator: bigint,
  denominator: bigint,
): bigint {
  const division = numerator / denominator;
  const reminder = numerator % denominator;
  const doubleReminder = reminder * 2n;

  if (doubleReminder < denominator) {
    return division;
  }

  if (doubleReminder > denominator) {
    return division + 1n;
  }

  return division % 2n == 0n ? division : division + 1n;
}
