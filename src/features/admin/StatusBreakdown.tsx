import { useId } from 'react';
import { Link } from 'react-router-dom';
import { orderLabel, orderStates } from '../orders/orders';

const colors = ['#566d60', '#8c7352', '#ae895b', '#748b85', '#9b786f', '#485d53', '#b3afa6'];

export function StatusBreakdown({ counts, total }: { counts: Record<string, number>; total: number }) {
 const titleId = useId();
 const circumference = 2 * Math.PI * 46;
 return <div className="admin-status-breakdown"><svg viewBox="0 0 120 120" role="img" aria-labelledby={titleId}><title id={titleId}>{total} orders by current operational status; counts listed alongside.</title><circle cx="60" cy="60" r="46" fill="none" stroke="#e9e7df" strokeWidth="13"/>{orderStates.map((status, index) => {
  const count = counts[status];
  const length = total ? count / total * circumference : 0;
  const offset = total ? orderStates.slice(0, index).reduce((sum, key) => sum + counts[key], 0) / total * circumference : 0;
  return count > 0 && total > 0 ? <circle key={status} cx="60" cy="60" r="46" fill="none" stroke={colors[index]} strokeWidth="13" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset} transform="rotate(-90 60 60)"/> : null;
 })}<text x="60" y="59" textAnchor="middle" className="admin-chart-total">{total}</text><text x="60" y="75" textAnchor="middle" className="admin-chart-label">orders</text></svg><dl className="admin-status-legend">{orderStates.map((status, index) => <div key={status}><dt><span aria-hidden="true" style={{ backgroundColor: colors[index] }}/><Link to={`/admin/orders?status=${status}`}>{orderLabel(status)}</Link></dt><dd>{counts[status]}</dd></div>)}</dl></div>;
}
