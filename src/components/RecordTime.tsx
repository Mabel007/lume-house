import { formatRecordTime } from '../config/dateTime';
export function RecordTime({ value }: { value: string }) {
  return <time dateTime={value} title={value}>{formatRecordTime(value)}</time>;
}
