export function formatRecordTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : `${date.toLocaleString('en-GB', { timeZone: 'UTC', hour12: false })} UTC`;
}
