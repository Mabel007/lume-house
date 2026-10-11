import { useId, type ReactNode } from 'react';

export type AdminColumn<T> = { key: string; heading: string; render: (row: T) => ReactNode; rowHeader?: boolean; numeric?: boolean };
export function AdminTable<T>({ caption, rows, columns, rowKey, className='' }: { caption: string; rows: T[]; columns: AdminColumn<T>[]; rowKey: (row: T) => string; className?: string }) {
  const hintId = useId();
  return <div className={`admin-table-shell ${className}`}>
    <p id={hintId} className="admin-table-hint">On smaller screens, scroll the table sideways to see all columns.</p>
    <div className="admin-table-scroll" role="region" tabIndex={0} aria-label={`${caption} table`} aria-describedby={hintId}>
      <table className="admin-data-table"><caption>{caption}</caption><thead><tr>{columns.map(column=><th key={column.key} scope="col" className={column.numeric?'numeric':undefined}>{column.heading}</th>)}</tr></thead>
        <tbody>{rows.map(row=><tr key={rowKey(row)}>{columns.map(column=>column.rowHeader?<th key={column.key} scope="row">{column.render(row)}</th>:<td key={column.key} className={column.numeric?'numeric':undefined}>{column.render(row)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  </div>;
}
