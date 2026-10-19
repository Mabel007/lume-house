export const majorPricePattern = '[0-9]+(\\.[0-9]{1,2})?';
export function majorToMinor(value: string): number {
  const input = value.trim();
  if (!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(input)) throw new Error('Enter a nonnegative NLE amount with up to two decimal places, for example 125.50.');
  const [whole, fraction = ''] = input.split('.');
  // Bound input length before BigInt; no floating-point conversion of decimals.
  if (whole.length > 10) throw new Error('Price must not exceed NLE 21,474,836.47.');
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (minor > 2147483647n) throw new Error('Price must not exceed NLE 21,474,836.47.');
  return Number(minor);
}
export function minorToMajor(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value > 2147483647) throw new Error('Invalid stored price. Reload before editing.');
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, '0')}`;
}
