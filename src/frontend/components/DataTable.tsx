import type { ReactNode } from 'react';

export interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (row: T) => ReactNode;
}

export function DataTable<T>({ rows, columns }: { rows: T[]; columns: Column<T>[] }) {
  return (
    <div className="bg-white shadow rounded overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left">
          <tr>{columns.map((c) => <th key={String(c.key)} className="p-3">{c.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td className="p-6 text-center text-slate-500" colSpan={columns.length}>No data.</td></tr>
          ) : rows.map((r, i) => (
            <tr key={i} className="border-t">
              {columns.map((c) => (
                <td key={String(c.key)} className="p-3">
                  {c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key as string] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
