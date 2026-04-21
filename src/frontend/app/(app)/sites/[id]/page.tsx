'use client';

import { useEffect, useState } from 'react';
import { ApiError, apiFetch } from '../../../../lib/api';
import { MilestoneStepper } from '../../../../components/MilestoneStepper';
import type { MilestoneDto, SiteDto } from 'deliveriq-shared';

interface SiteDetail extends SiteDto {
  sow: { id: string; sowNumber: string; planRfsDate: string };
  milestones: MilestoneDto[];
  assignedFieldUser: { fullName: string; email: string } | null;
}

export default function SiteDetailPage({ params }: { params: { id: string } }) {
  const [site, setSite] = useState<SiteDetail | null>(null);
  const [milestoneId, setMilestoneId] = useState<string>('');
  const [status, setStatus] = useState<'IN_PROGRESS' | 'DONE' | 'BLOCKED'>('IN_PROGRESS');
  const [actualDate, setActualDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [remark, setRemark] = useState<string>('');
  const [approvalStage, setApprovalStage] = useState<'ASSET' | 'PM' | 'PROJECT_CLOSING'>('ASSET');
  const [approvalDecision, setApprovalDecision] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [msg, setMsg] = useState<string>('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch<SiteDetail>(`/v1/sites/${params.id}`).then((data) => {
      setSite(data);
      setMilestoneId((prev) => prev || data.milestones?.[0]?.id || '');
    }).catch(() => undefined);
  }, [params.id]);

  async function refreshSite() {
    const data = await apiFetch<SiteDetail>(`/v1/sites/${params.id}`);
    setSite(data);
  }

  async function submitMilestoneUpdate() {
    if (!milestoneId) return;
    setBusy(true);
    setMsg('');
    try {
      await apiFetch(`/v1/milestones/${milestoneId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          actualDate: status === 'DONE' ? new Date(`${actualDate}T00:00:00.000Z`) : null,
          remark: remark || null,
        }),
      });
      await refreshSite();
      setMsg('Milestone updated.');
    } catch (err) {
      const detail = err instanceof ApiError ? (err.detail ?? err.message) : (err instanceof Error ? err.message : 'Update failed');
      setMsg(detail);
    } finally {
      setBusy(false);
    }
  }

  async function submitApproval() {
    if (!milestoneId) return;
    setBusy(true);
    setMsg('');
    try {
      await apiFetch(`/v1/milestones/${milestoneId}/approvals`, {
        method: 'POST',
        body: JSON.stringify({
          stage: approvalStage,
          decision: approvalDecision,
          note: remark || undefined,
        }),
      });
      setMsg('Approval submitted.');
    } catch (err) {
      const detail = err instanceof ApiError ? (err.detail ?? err.message) : (err instanceof Error ? err.message : 'Approval failed');
      setMsg(detail);
    } finally {
      setBusy(false);
    }
  }

  if (!site) return <div className="text-slate-500">Loading…</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{site.code} — {site.name}</h1>
      <div className="text-sm text-slate-600">
        SOW: {site.sow.sowNumber} · Type: {site.type} · Field user: {site.assignedFieldUser?.fullName ?? '—'}
      </div>
      <div className="bg-white shadow rounded p-4">
        <h2 className="font-semibold mb-3">Milestone Timeline</h2>
        <MilestoneStepper milestones={site.milestones} />
      </div>
      <div className="bg-white shadow rounded p-4 space-y-3">
        <h2 className="font-semibold">Milestone Actions</h2>
        <div className="grid md:grid-cols-2 gap-3">
          <label className="text-sm text-slate-600">
            Milestone
            <select
              className="mt-1 w-full rounded border border-slate-300 px-2 py-2"
              value={milestoneId}
              onChange={(e) => setMilestoneId(e.target.value)}
            >
              {site.milestones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.sequence}. {m.type} ({m.status})
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-600">
            Status
            <select
              className="mt-1 w-full rounded border border-slate-300 px-2 py-2"
              value={status}
              onChange={(e) => setStatus(e.target.value as 'IN_PROGRESS' | 'DONE' | 'BLOCKED')}
            >
              <option value="IN_PROGRESS">IN_PROGRESS</option>
              <option value="DONE">DONE</option>
              <option value="BLOCKED">BLOCKED</option>
            </select>
          </label>
          <label className="text-sm text-slate-600">
            Actual date
            <input
              type="date"
              className="mt-1 w-full rounded border border-slate-300 px-2 py-2"
              value={actualDate}
              onChange={(e) => setActualDate(e.target.value)}
            />
          </label>
          <label className="text-sm text-slate-600">
            Approval stage
            <select
              className="mt-1 w-full rounded border border-slate-300 px-2 py-2"
              value={approvalStage}
              onChange={(e) => setApprovalStage(e.target.value as 'ASSET' | 'PM' | 'PROJECT_CLOSING')}
            >
              <option value="ASSET">ASSET</option>
              <option value="PM">PM</option>
              <option value="PROJECT_CLOSING">PROJECT_CLOSING</option>
            </select>
          </label>
          <label className="text-sm text-slate-600">
            Approval decision
            <select
              className="mt-1 w-full rounded border border-slate-300 px-2 py-2"
              value={approvalDecision}
              onChange={(e) => setApprovalDecision(e.target.value as 'APPROVE' | 'REJECT')}
            >
              <option value="APPROVE">APPROVE</option>
              <option value="REJECT">REJECT</option>
            </select>
          </label>
        </div>
        <label className="text-sm text-slate-600 block">
          Remark / approval note
          <textarea
            className="mt-1 w-full rounded border border-slate-300 px-2 py-2 min-h-24"
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={submitMilestoneUpdate}
            disabled={busy || !milestoneId}
            className="rounded bg-slate-900 text-white px-3 py-2 text-sm disabled:opacity-60"
          >
            Update Milestone
          </button>
          <button
            type="button"
            onClick={submitApproval}
            disabled={busy || !milestoneId}
            className="rounded bg-blue-700 text-white px-3 py-2 text-sm disabled:opacity-60"
          >
            Submit Approval
          </button>
        </div>
        {msg && <p className="text-sm text-slate-600">{msg}</p>}
      </div>
    </div>
  );
}
