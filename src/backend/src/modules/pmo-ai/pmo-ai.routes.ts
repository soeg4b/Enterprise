// PMO AI Agentic module — three specialized AI agents for enterprise PMO delivery.
// Uses OpenAI-compatible streaming API (configurable via env vars).
// Architecture: context injection from Prisma DB → system prompt → streamed SSE to frontend.
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// ── Types ──────────────────────────────────────────────────────────────────────
type AgentId = 'pm' | 'control' | 'quality';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// ── Agent Definitions ──────────────────────────────────────────────────────────
export const AGENTS: Record<AgentId, {
  id: AgentId; name: string; role: string; description: string; color: string;
}> = {
  pm: {
    id: 'pm',
    name: 'Project Manager Agent',
    role: 'Senior Project Manager',
    description: 'Identifikasi titik kritis, strategi delivery, pengelolaan risiko, on-time & in-budget.',
    color: 'blue',
  },
  control: {
    id: 'control',
    name: 'Project Control Agent',
    role: 'Project Control Officer',
    description: 'Monitor portfolio, alert & eskalasi isu, koordinasi lintas lini sehari-hari.',
    color: 'amber',
  },
  quality: {
    id: 'quality',
    name: 'Quality & Documentation Agent',
    role: 'Quality Assurance Officer',
    description: 'Review output, standar dokumentasi, penerimaan customer, compliance internal.',
    color: 'emerald',
  },
};

// ── System Prompts ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPTS: Record<AgentId, string> = {
  pm: `Anda adalah Agen AI berperan sebagai Senior Project Manager berpengalaman di bidang telekomunikasi dan enterprise delivery Indonesia.

IDENTITAS & TANGGUNG JAWAB:
- Bekerja untuk PMO (Project Management Office) perusahaan telekomunikasi enterprise
- Bertanggung jawab atas ketepatan waktu, budget, dan scope seluruh project portfolio
- Berpengalaman dalam metodologi PMBOK/PMBook namun adaptif terhadap realita lapangan Indonesia
- Memiliki naluri bisnis yang kuat: revenue realization, customer satisfaction, stakeholder management

PRINSIP KERJA:
- Selalu IDENTIFIKASI TITIK KRITIS dan potensi risiko SEBELUM eskalasi terjadi
- Berikan rekomendasi KONKRET dan ACTIONABLE — bukan hanya analisis deskriptif
- Gunakan angka dan data aktual untuk mendukung setiap argumen
- Berpikir 2-3 langkah ke depan: antisipasi hambatan, siapkan mitigasi
- Sensitif terhadap konteks lokal: kondisi vendor, regulasi daerah, perizinan

HIERARKI PRIORITAS:
1. 🔴 Project DELAY → Immediate corrective action + notifikasi manajemen
2. 🟡 Project AT_RISK → Proactive mitigation + monitor intensif
3. ⏰ Milestone due ≤7 hari → Persiapkan resources dan pre-check
4. 💰 Revenue at risk → Eskalasi ke DH/BOD dengan business impact
5. 🧑‍🤝‍🧑 Resource bottleneck → Redistribusi atau eskalasi ke vendor

FORMAT RESPONS:
- Bahasa Indonesia profesional dan padat — hindari jargon berlebihan
- Sertakan angka konkret: gap hari, % delay, nilai IDR, jumlah sites
- Berikan action items dengan format: [AKSI] → [PIC yang direkomendasikan] → [Deadline]
- Gunakan emoji sebagai indikator visual: ⚠️ risiko, 🔴 delay, 🟢 on-track, 💡 rekomendasi
- Tutup dengan ringkasan "Top 3 Prioritas Minggu Ini"`,

  control: `Anda adalah Agen AI berperan sebagai Project Control Officer untuk program enterprise delivery di Indonesia.

IDENTITAS & TANGGUNG JAWAB:
- Monitor seluruh project dalam portfolio PMO secara sistematis dan real-time
- Memberikan alert dan eskalasi berbasis threshold yang terukur dan konsisten
- Koordinasi daily antar tim: Project Manager, Field Engineer/Mitra, Finance, Vendor
- Menghasilkan laporan status yang akurat untuk manajemen

FUNGSI UTAMA — "4M":
1. MONITOR: Pantau milestone completion rate, SLA vendor, budget burn, resource utilization
2. MEASURE: Hitung KPI: schedule performance index, cost performance index, % on-track
3. MANAGE ISSUE: Identifikasi blocker, root cause awal, rekomendasi penyelesaian
4. MOBILIZE: Tentukan level eskalasi dan jalur komunikasi yang tepat

THRESHOLD ALERT:
- Delay > 3 hari → Level 1: Alert ke PM
- Delay > 7 hari → Level 2: Eskalasi ke Department Head
- Delay > 14 hari → Level 3: Laporan ke BOD
- Budget overrun > 10% → Notifikasi Finance & PM
- Vendor SLA breach → Warning + remediation plan

FORMAT RESPONS:
- Sajikan dalam format laporan terstruktur dan siap-pakai
- Gunakan status indikator: 🟢 ON TRACK | 🟡 AT RISK | 🔴 DELAY | ⛔ CRITICAL
- Exception Report harus mencakup: issue, root cause, impact, recommended action, due date
- Akhiri dengan "Agenda Koordinasi Hari Ini" — maksimal 5 poin prioritas`,

  quality: `Anda adalah Agen AI berperan sebagai Quality Assurance & Documentation Officer untuk delivery PMO di Indonesia.

IDENTITAS & TANGGUNG JAWAB:
- Gate keeper kualitas untuk setiap milestone, deliverable, dan handover
- Memastikan dokumentasi lengkap sesuai standar internal perusahaan dan requirement customer
- Review output sebelum customer acceptance dan revenue claim
- Menjaga konsistensi standar across semua project dalam portfolio

CHECKLIST WAJIB PRE-RFS:
□ OTDR test (TX & RX direction) → Verdict: PASS
□ Surat Izin Pemerintah Daerah / Permit (per ruas jalan)
□ Foto dokumentasi site tagged GPS (semua tiang/titik instalasi)
□ As-built drawing final (updated dari design awal)
□ Test report lengkap, ditandatangani PM dan perwakilan customer
□ Handover document package disiapkan

CHECKLIST WAJIB HANDOVER:
□ Berita Acara Serah Terima (BAST) ditandatangani
□ Sertifikat garansi perangkat/material dari vendor
□ Dokumen SLA final yang telah disepakati
□ Revenue claim trigger terupdate di sistem (OTC + MRC)
□ Training completion certificate (jika ada)

STANDAR KUALITAS INTERNAL:
- Setiap keterlambatan harus memiliki justifikasi tertulis dan disetujui PM
- Change request wajib melalui proses formal approval (tidak boleh verbal)
- Foto site + koordinat GPS mandatory untuk setiap titik instalasi fisik
- OTDR test mandatory untuk SEMUA link FO sebelum klaim RFS
- NCR (Non-Conformance Report) harus diselesaikan sebelum handover

FORMAT RESPONS:
- Gunakan checklist format yang langsung dapat ditindaklanjuti
- Identifikasi gap antara kondisi aktual vs standar yang berlaku
- Berikan corrective action plan per gap dengan PIC dan deadline
- Highlight risiko penolakan customer atau audit finding dengan ⛔
- Sertakan "Readiness Score" estimasi (0-100%) berdasarkan checklist`,
};

// ── Context Builder ────────────────────────────────────────────────────────────
async function buildProjectContext(agentId: AgentId): Promise<string> {
  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 86400000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
  const isoDate = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });

  const lines: string[] = [
    `╔════════════════════════════════════════════════════════════╗`,
    `║  DATA REAL-TIME SISTEM DeliverIQ  —  ${isoDate}`,
    `╚════════════════════════════════════════════════════════════╝`,
    '',
  ];

  // SOW portfolio summary (SOW = unit kerja dengan RFS target & warningLevel)
  try {
    const sows = await prisma.sOW.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        sowNumber: true,
        planRfsDate: true,
        actualRfsDate: true,
        warningLevel: true,
        progressPct: true,
        gapDays: true,
        so: {
          select: {
            order: {
              select: {
                orderNumber: true,
                productCategory: true,
                otcAmount: true,
                mrcAmount: true,
                customer: { select: { name: true } },
              },
            },
          },
        },
        _count: { select: { sites: true } },
      },
      orderBy: { planRfsDate: 'asc' },
      take: 100,
    });

    const onTrack = sows.filter((s) => s.warningLevel === 'ON_TRACK').length;
    const atRisk = sows.filter((s) => s.warningLevel === 'AT_RISK').length;
    const delay = sows.filter((s) => s.warningLevel === 'DELAY').length;
    const rfsAchieved = sows.filter((s) => s.actualRfsDate).length;

    const totalOtc = sows.reduce((sum, s) => sum + Number(s.so.order.otcAmount ?? 0), 0);
    const totalMrc = sows.reduce((sum, s) => sum + Number(s.so.order.mrcAmount ?? 0), 0);

    lines.push('▶ RINGKASAN PORTFOLIO SOW / PROGRAM DELIVERY');
    lines.push(`  Total SOW Aktif: ${sows.length}  |  RFS Achieved: ${rfsAchieved}`);
    lines.push(`  🟢 ON TRACK: ${onTrack}  |  🟡 AT RISK: ${atRisk}  |  🔴 DELAY: ${delay}`);
    lines.push(`  Nilai OTC Total: IDR ${(totalOtc / 1e9).toFixed(2)} Miliar`);
    lines.push(`  Nilai MRC Total: IDR ${(totalMrc / 1e6).toFixed(1)} Juta/bulan`);
    lines.push('');

    // Critical SOWs (DELAY / AT_RISK)
    const critical = sows.filter((s) => s.warningLevel === 'DELAY' || s.warningLevel === 'AT_RISK');
    if (critical.length > 0) {
      lines.push('▶ SOW KRITIS (DELAY / AT_RISK)');
      for (const s of critical.slice(0, 15)) {
        const icon = s.warningLevel === 'DELAY' ? '🔴' : '🟡';
        const rfsInfo = s.actualRfsDate
          ? `✅ RFS: ${new Date(s.actualRfsDate).toLocaleDateString('id-ID')}`
          : s.planRfsDate
            ? (() => {
                const diff = Math.ceil((new Date(s.planRfsDate).getTime() - now.getTime()) / 86400000);
                return diff < 0 ? `⛔ Lewat ${Math.abs(diff)}h` : `Target ${diff}h lagi`;
              })()
            : 'Target: TBD';
        const siteCnt = (s._count as { sites: number }).sites;
        lines.push(`  ${icon} [${s.so.order.orderNumber}] ${s.so.order.customer.name} | SOW: ${s.sowNumber} | ${s.so.order.productCategory ?? '-'} | ${rfsInfo} | Gap: ${s.gapDays}h | Sites: ${siteCnt} | Progress: ${Number(s.progressPct).toFixed(0)}%`);
      }
      lines.push('');
    }

    // On-track SOWs (sample)
    const onTrackSows = sows.filter((s) => s.warningLevel === 'ON_TRACK').slice(0, 8);
    if (onTrackSows.length > 0) {
      lines.push('▶ SOW ON TRACK (sample)');
      for (const s of onTrackSows) {
        const rfsInfo = s.actualRfsDate
          ? `RFS Done`
          : s.planRfsDate
            ? (() => {
                const diff = Math.ceil((new Date(s.planRfsDate).getTime() - now.getTime()) / 86400000);
                return diff < 0 ? `Lewat ${Math.abs(diff)}h` : `${diff}h lagi`;
              })()
            : 'TBD';
        lines.push(`  🟢 [${s.so.order.orderNumber}] ${s.so.order.customer.name} | ${s.sowNumber} | ${rfsInfo} | ${Number(s.progressPct).toFixed(0)}%`);
      }
      lines.push('');
    }
  } catch (e) {
    lines.push(`  [Data SOW tidak tersedia: ${String(e)}]`);
    lines.push('');
  }

  // Overdue milestones (planDate < now, status != DONE)
  try {
    const overdue = await prisma.milestone.findMany({
      where: {
        planDate: { lt: now },
        status: { in: ['NOT_STARTED', 'IN_PROGRESS', 'BLOCKED'] },
        deletedAt: null,
      },
      select: {
        type: true,
        status: true,
        planDate: true,
        overdueDays: true,
        sow: {
          select: {
            sowNumber: true,
            so: {
              select: {
                order: {
                  select: {
                    orderNumber: true,
                    customer: { select: { name: true } },
                  },
                },
              },
            },
          },
        },
        site: { select: { name: true, code: true } },
      },
      orderBy: { planDate: 'asc' },
      take: 25,
    });

    const upcoming = await prisma.milestone.findMany({
      where: {
        planDate: { gte: now, lte: sevenDaysFromNow },
        status: { in: ['NOT_STARTED', 'IN_PROGRESS'] },
        deletedAt: null,
      },
      select: {
        type: true,
        status: true,
        planDate: true,
        sow: {
          select: {
            sowNumber: true,
            so: {
              select: {
                order: {
                  select: {
                    orderNumber: true,
                    customer: { select: { name: true } },
                  },
                },
              },
            },
          },
        },
        site: { select: { name: true } },
      },
      orderBy: { planDate: 'asc' },
      take: 20,
    });

    if (overdue.length > 0) {
      lines.push(`▶ MILESTONE OVERDUE — ${overdue.length} item (PERLU TINDAKAN SEGERA)`);
      for (const m of overdue) {
        const siteName = m.site?.name ?? m.sow.sowNumber;
        const diffDays = m.overdueDays > 0 ? m.overdueDays : Math.ceil((now.getTime() - new Date(m.planDate!).getTime()) / 86400000);
        lines.push(`  ⛔ [${m.sow.so.order.orderNumber}] ${m.sow.so.order.customer.name} | Site: ${siteName} | Tipe: ${m.type} | Status: ${m.status} | Overdue: ${diffDays} hari`);
      }
      lines.push('');
    }

    if (upcoming.length > 0) {
      lines.push(`▶ MILESTONE DUE ≤7 HARI — ${upcoming.length} item (PERLU PERHATIAN)`);
      for (const m of upcoming) {
        const siteName = m.site?.name ?? m.sow.sowNumber;
        const diff = Math.ceil((new Date(m.planDate!).getTime() - now.getTime()) / 86400000);
        lines.push(`  ⏰ [${m.sow.so.order.orderNumber}] ${m.sow.so.order.customer.name} | Site: ${siteName} | Tipe: ${m.type} | Sisa: ${diff} hari`);
      }
      lines.push('');
    }

    if (overdue.length === 0 && upcoming.length === 0) {
      lines.push('▶ MILESTONE: Tidak ada milestone overdue atau yang mendekati due date.');
      lines.push('');
    }
  } catch (e) {
    lines.push(`  [Data milestones tidak tersedia: ${String(e)}]`);
    lines.push('');
  }

  // Sites by warningLevel
  try {
    const siteStats = await prisma.site.groupBy({
      by: ['warningLevel'],
      where: { deletedAt: null },
      _count: { id: true },
    });

    if (siteStats.length > 0) {
      lines.push('▶ STATUS SITES (SEMUA SOW)');
      for (const s of siteStats) {
        const icon = s.warningLevel === 'ON_TRACK' ? '🟢' : s.warningLevel === 'AT_RISK' ? '🟡' : '🔴';
        lines.push(`  ${icon} ${s.warningLevel}: ${(s._count as { id: number }).id} sites`);
      }
      lines.push('');
    }
  } catch {
    // Silently skip
  }

  // Recent alerts/notifications
  try {
    const alerts = await prisma.notification.findMany({
      where: {
        kind: { in: ['MILESTONE_OVERDUE', 'WARNING_RAISED'] },
        createdAt: { gte: sevenDaysAgo },
      },
      select: { title: true, body: true, createdAt: true, kind: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    if (alerts.length > 0) {
      lines.push('▶ NOTIFIKASI & ALERT 7 HARI TERAKHIR');
      for (const a of alerts) {
        lines.push(`  ⚠️ [${new Date(a.createdAt).toLocaleDateString('id-ID')}] ${a.title}: ${a.body}`);
      }
      lines.push('');
    }
  } catch {
    // No notifications yet — OK
  }

  // Quality agent: pending revenue claims
  if (agentId === 'quality') {
    try {
      const pendingClaims = await prisma.revenueClaim.findMany({
        where: { status: 'PENDING', deletedAt: null },
        select: {
          type: true,
          amount: true,
          sow: {
            select: {
              sowNumber: true,
              so: {
                select: {
                  order: {
                    select: {
                      orderNumber: true,
                      customer: { select: { name: true } },
                    },
                  },
                },
              },
            },
          },
        },
        take: 15,
      });

      if (pendingClaims.length > 0) {
        lines.push(`▶ REVENUE CLAIM PENDING — ${pendingClaims.length} item`);
        for (const c of pendingClaims) {
          lines.push(`  💰 [${c.sow.so.order.orderNumber}] ${c.sow.so.order.customer.name} | SOW: ${c.sow.sowNumber} | Tipe: ${c.type} | IDR ${Number(c.amount ?? 0).toLocaleString('id-ID')}`);
        }
        lines.push('');
      }
    } catch {
      // Claims may not exist in demo
    }
  }

  lines.push('╔═══ CATATAN ═══════════════════════════════════════════════╗');
  lines.push('║ Data di atas adalah snapshot real-time dari sistem.       ║');
  lines.push('║ Data topology, partner, & standar teknis akan ditambahkan ║');
  lines.push('║ setelah konfigurasi tambahan selesai.                     ║');
  lines.push('╚═══════════════════════════════════════════════════════════╝');

  return lines.join('\n');
}

// ── LLM Streaming Client (OpenAI-compatible) ───────────────────────────────────
interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens: number;
}

async function* streamLLM(messages: ChatMessage[], cfg: LLMConfig): AsyncGenerator<string> {
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      stream: true,
      max_tokens: cfg.maxTokens,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`LLM API responded ${res.status}: ${errBody.slice(0, 300)}`);
  }

  if (!res.body) throw new Error('LLM API returned no body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') return;
      try {
        const parsed = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
        };
        const text = parsed.choices?.[0]?.delta?.content;
        if (text) yield text;
      } catch {
        // Ignore malformed SSE tokens
      }
    }
  }
}

// ── Route Schemas ──────────────────────────────────────────────────────────────
const ChatBodySchema = z.object({
  agentId: z.enum(['pm', 'control', 'quality']),
  message: z.string().min(1).max(4000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(8000),
      }),
    )
    .max(20)
    .default([]),
  includeContext: z.boolean().default(true),
  sessionId: z.string().optional(),
});

// ── Fastify Plugin ─────────────────────────────────────────────────────────────
export async function pmoAiRoutes(app: FastifyInstance): Promise<void> {
  // GET /v1/pmo-ai/agents — list agents + config status
  app.get('/v1/pmo-ai/agents', async () => {
    const apiKey = process.env['PMO_AI_API_KEY'] ?? '';
    const configured = apiKey.length > 0 && apiKey !== 'your-api-key-here';
    return {
      agents: Object.values(AGENTS),
      configured,
      model: configured ? (process.env['PMO_AI_MODEL'] ?? 'gpt-4o') : null,
      provider: configured ? (process.env['PMO_AI_BASE_URL'] ?? 'openai') : null,
    };
  });

  // GET /v1/pmo-ai/context/:agentId — preview context data only (no LLM)
  app.get<{ Params: { agentId: string } }>(
    '/v1/pmo-ai/context/:agentId',
    async (req, reply) => {
      const id = req.params.agentId as AgentId;
      if (!['pm', 'control', 'quality'].includes(id)) {
        return reply.code(400).send({ code: 'INVALID_AGENT', detail: 'Unknown agent ID' });
      }
      const context = await buildProjectContext(id);
      return { agentId: id, context };
    },
  );

  // POST /v1/pmo-ai/chat — streaming SSE chat
  app.post('/v1/pmo-ai/chat', async (req: FastifyRequest, reply: FastifyReply) => {
    // Validate body
    const parseResult = ChatBodySchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        code: 'INVALID_BODY',
        detail: parseResult.error.message,
      });
    }
    const { agentId, message, history, includeContext } = parseResult.data;

    // Check AI config
    const apiKey = process.env['PMO_AI_API_KEY'] ?? '';
    const baseUrl = (process.env['PMO_AI_BASE_URL'] ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    const model = process.env['PMO_AI_MODEL'] ?? 'gpt-4o';
    const maxTokens = parseInt(process.env['PMO_AI_MAX_TOKENS'] ?? '2048', 10);

    if (!apiKey || apiKey === 'your-api-key-here') {
      return reply.code(503).send({
        code: 'AI_NOT_CONFIGURED',
        detail:
          'PMO_AI_API_KEY belum dikonfigurasi. Tambahkan API key ke file .env untuk mengaktifkan fitur AI.',
      });
    }

    // Build context block
    let contextBlock = '';
    if (includeContext) {
      try {
        contextBlock = await buildProjectContext(agentId);
      } catch (e) {
        contextBlock = `[Konteks tidak tersedia: ${String(e)}]`;
      }
    }

    const systemContent = SYSTEM_PROMPTS[agentId] + (contextBlock ? `\n\n${contextBlock}` : '');

    const messages: ChatMessage[] = [
      { role: 'system', content: systemContent },
      ...history,
      { role: 'user', content: message },
    ];

    // Stream SSE response
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
    });

    try {
      for await (const chunk of streamLLM(messages, { baseUrl, apiKey, model, maxTokens })) {
        reply.raw.write(`data: ${JSON.stringify({ type: 'token', content: chunk })}\n\n`);
      }
      reply.raw.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      reply.raw.write(`data: ${JSON.stringify({ type: 'error', error: errMsg })}\n\n`);
    } finally {
      reply.raw.end();
    }
  });

  // POST /v1/pmo-ai/configure — save API key to .env + update process.env in-memory
  const ConfigBodySchema = z.object({
    apiKey: z.string().min(8, 'API key terlalu pendek'),
    model: z.string().optional(),
    baseUrl: z.string().url().optional(),
  });

  app.post('/v1/pmo-ai/configure', async (req: FastifyRequest, reply: FastifyReply) => {
    const parseResult = ConfigBodySchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.code(400).send({ code: 'INVALID_BODY', detail: parseResult.error.message });
    }
    const { apiKey, model, baseUrl } = parseResult.data;

    // Update process.env in-memory immediately (no restart needed for current run)
    process.env['PMO_AI_API_KEY'] = apiKey;
    if (model) process.env['PMO_AI_MODEL'] = model;
    if (baseUrl) process.env['PMO_AI_BASE_URL'] = baseUrl;

    // Persist to .env file so it survives restart
    const envPath = resolve(process.cwd(), '.env');
    if (existsSync(envPath)) {
      let content = readFileSync(envPath, 'utf8');
      const updateEnvVar = (key: string, value: string) => {
        const regex = new RegExp(`^(${key}=).*$`, 'm');
        if (regex.test(content)) {
          content = content.replace(regex, `$1${value}`);
        } else {
          content += `\n${key}=${value}`;
        }
      };
      updateEnvVar('PMO_AI_API_KEY', apiKey);
      if (model) updateEnvVar('PMO_AI_MODEL', model);
      if (baseUrl) updateEnvVar('PMO_AI_BASE_URL', baseUrl);
      writeFileSync(envPath, content, 'utf8');
    }

    return reply.send({ ok: true, model: process.env['PMO_AI_MODEL'] ?? 'gpt-4o' });
  });

  // DELETE /v1/pmo-ai/configure — remove API key (reset to unconfigured)
  app.delete('/v1/pmo-ai/configure', async (_req, reply) => {
    process.env['PMO_AI_API_KEY'] = 'your-api-key-here';
    const envPath = resolve(process.cwd(), '.env');
    if (existsSync(envPath)) {
      let content = readFileSync(envPath, 'utf8');
      content = content.replace(/^PMO_AI_API_KEY=.*/m, 'PMO_AI_API_KEY=your-api-key-here');
      writeFileSync(envPath, content, 'utf8');
    }
    return reply.send({ ok: true });
  });
}
