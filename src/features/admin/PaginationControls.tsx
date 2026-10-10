import { pageSizes, type PageSize } from './adminPagination';
import './pagination.css';

type Props = { page: number; size: PageSize; total: number; loading: boolean; error: string; changePage: (page: number) => void; changeSize: (size: PageSize) => void };
export function AdminPagination({ page, size, total, loading, error, changePage, changeSize }: Props) {
 const pages = Math.ceil(total / size);
 return <nav className="admin-pagination" aria-label="Record pagination" aria-busy={loading}>
  <label>Records per page<select value={size} onChange={event => changeSize(Number(event.target.value) as PageSize)}>{pageSizes.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
  <p role="status">{loading ? 'Loading records…' : error ? 'Records unavailable' : `${total} records · Page ${pages ? page + 1 : 0} of ${pages}`}</p>
  <button type="button" disabled={loading || Boolean(error) || page === 0 || !pages} onClick={() => changePage(page - 1)}>Previous</button>
  <button type="button" disabled={loading || Boolean(error) || page + 1 >= pages} onClick={() => changePage(page + 1)}>Next</button>
 </nav>;
}
