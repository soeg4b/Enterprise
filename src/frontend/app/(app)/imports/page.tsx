'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch, API_URL, getAccessToken } from '../../../lib/api';

interface ImportJob { id: string; fileName: string; status: string; totalRows: number; validRows: number; invalidRows: number; }

export default function ImportsPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const refresh = async () => {
    const r = await apiFetch<{ data: ImportJob[] }>('/v1/imports');
    setJobs(r.data);
    if (activeId) {
      const found = r.data.find((j) => j.id === activeId);
      if (found && (found.status === 'VALIDATED' || found.status === 'COMMITTED' || found.status === 'FAILED')) {
        setActiveId(null);
      }
    }
  };

  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    if (!activeId) return;
    const t = setInterval(() => { void refresh(); }, 2000);
    return () => clearInterval(t);
  }, [activeId]);

  async function upload() {
    const f = fileRef.current?.files?.[0];
    if (!f) { setError('Choose a file first'); return; }
    setError(null); setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const res = await fetch(`${API_URL}/v1/imports/excel`, {
        method: 'POST', body: fd,
        headers: { Authorization: `Bearer ${getAccessToken() ?? ''}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail ?? 'Upload failed');
      setActiveId(json.importJobId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Excel Import</h1>
      <div className="bg-white shadow rounded p-4 flex items-center gap-3">
        <input ref={fileRef} type="file" accept=".xlsx,.xls" />
        <button onClick={upload} disabled={busy} className="px-4 py-2 bg-slate-900 text-white rounded disabled:opacity-60">
          {busy ? 'Uploading…' : 'Upload'}
        </button>
        {error && <span className="text-red-600 text-sm">{error}</span>}
      </div>
      <div className="bg-white shadow rounded">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr><th className="p-3">File</th><th className="p-3">Status</th><th className="p-3">Rows</th><th className="p-3">Valid</th><th className="p-3">Invalid</th></tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id} className="border-t">
                <td className="p-3 font-mono">{j.fileName}</td>
                <td className="p-3">{j.status}</td>
                <td className="p-3">{j.totalRows}</td>
                <td className="p-3 text-green-700">{j.validRows}</td>
                <td className="p-3 text-red-700">{j.invalidRows}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
