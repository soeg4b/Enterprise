'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_URL, getAccessToken } from '../../../lib/api';

// ── Preset providers ──────────────────────────────────────────────────────────
const PROVIDERS = [
  {
    id: 'groq',
    name: 'Groq (Gratis)',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    keyUrl: 'https://console.groq.com/keys',
    hint: 'Daftar gratis di console.groq.com → API Keys',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    keyUrl: 'https://platform.openai.com/api-keys',
    hint: 'platform.openai.com → API Keys',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.0-flash',
    keyUrl: 'https://aistudio.google.com/apikey',
    hint: 'aistudio.google.com → Get API key (gratis)',
  },
  {
    id: 'ollama',
    name: 'Ollama (Lokal)',
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.2',
    keyUrl: '',
    hint: 'Ollama harus sudah terinstall di komputer ini',
  },
] as const;

// ── Types ──────────────────────────────────────────────────────────────────────
type AgentId = 'pm' | 'control' | 'quality';

interface AgentInfo {
  id: AgentId;
  name: string;
  role: string;
  description: string;
  color: string;
}

interface ChatEntry {
  role: 'user' | 'assistant';
  content: string;
  agentId?: AgentId;
  timestamp: Date;
}

// ── Agent color maps ───────────────────────────────────────────────────────────
const AGENT_COLORS: Record<AgentId, { bg: string; border: string; badge: string; dot: string }> = {
  pm: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    badge: 'bg-blue-100 text-blue-800',
    dot: 'bg-blue-500',
  },
  control: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    badge: 'bg-amber-100 text-amber-800',
    dot: 'bg-amber-500',
  },
  quality: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    badge: 'bg-emerald-100 text-emerald-800',
    dot: 'bg-emerald-500',
  },
};

const AGENT_ICONS: Record<AgentId, string> = {
  pm: '🎯',
  control: '📊',
  quality: '✅',
};

const AGENT_STARTERS: Record<AgentId, string[]> = {
  pm: [
    'Apa project yang paling berisiko saat ini dan apa rekomendasimu?',
    'Berikan analisis titik kritis portfolio bulan ini.',
    'Project mana yang membutuhkan eskalasi ke manajemen?',
    'Bagaimana strategi recovery untuk project yang delay?',
  ],
  control: [
    'Buat laporan exception report portfolio hari ini.',
    'Berikan status monitoring semua program aktif.',
    'Milestone apa saja yang overdue dan siapa PIC-nya?',
    'Identifikasi blocker utama yang perlu koordinasi segera.',
  ],
  quality: [
    'Periksa kesiapan handover untuk project yang akan RFS.',
    'Apa saja gap dokumentasi yang perlu dilengkapi?',
    'Review checklist pre-RFS untuk project aktif.',
    'Identifikasi risiko penolakan customer di project kritis.',
  ],
};

// ── Component ──────────────────────────────────────────────────────────────────
export default function PmoAiPage() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentId>('pm');
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [contextView, setContextView] = useState<string | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [sessionHistories, setSessionHistories] = useState<Record<AgentId, ChatEntry[]>>({
    pm: [], control: [], quality: [],
  });

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refreshStatus = useCallback(() => {
    fetch(`${API_URL}/v1/pmo-ai/agents`)
      .then((r) => r.json())
      .then((d: { agents: AgentInfo[]; configured: boolean }) => {
        setAgents(d.agents);
        setConfigured(d.configured);
      })
      .catch(() => setConfigured(false));
  }, []);

  // Load agent list on mount
  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Sync messages with session history per agent
  useEffect(() => {
    setMessages(sessionHistories[selectedAgent]);
    setStreamingContent('');
    setError(null);
  }, [selectedAgent]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadContext = useCallback(async () => {
    setLoadingContext(true);
    setContextView(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const r = await fetch(`${API_URL}/v1/pmo-ai/context/${selectedAgent}`, { headers });
      const d = await r.json() as { context: string };
      setContextView(d.context);
    } catch (e) {
      setContextView(`Error: ${String(e)}`);
    } finally {
      setLoadingContext(false);
    }
  }, [selectedAgent]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || streaming) return;
    setError(null);

    const userEntry: ChatEntry = { role: 'user', content: text.trim(), timestamp: new Date() };
    const newMessages = [...messages, userEntry];
    setMessages(newMessages);
    setInput('');
    setStreaming(true);
    setStreamingContent('');

    // Build history for API (last 10 exchanges)
    const history = newMessages.slice(-20).map((m) => ({ role: m.role, content: m.content }));

    const token = getAccessToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    abortRef.current = new AbortController();

    try {
      const response = await fetch(`${API_URL}/v1/pmo-ai/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          agentId: selectedAgent,
          message: text.trim(),
          history: history.slice(0, -1), // exclude the just-added user message
          includeContext: true,
        }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ detail: `HTTP ${response.status}` })) as { detail?: string; code?: string };
        if (errData.code === 'AI_NOT_CONFIGURED') {
          setError('PMO AI belum dikonfigurasi. Tambahkan PMO_AI_API_KEY ke file .env dan restart backend.');
        } else {
          setError(errData.detail ?? `Server error ${response.status}`);
        }
        setStreaming(false);
        return;
      }

      if (!response.body) throw new Error('No response stream');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let fullContent = '';

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
          try {
            const parsed = JSON.parse(payload) as { type: string; content?: string; error?: string };
            if (parsed.type === 'token' && parsed.content) {
              fullContent += parsed.content;
              setStreamingContent(fullContent);
            } else if (parsed.type === 'error' && parsed.error) {
              setError(parsed.error);
            }
          } catch {
            // Skip malformed tokens
          }
        }
      }

      // Commit streamed content as final message
      if (fullContent) {
        const assistantEntry: ChatEntry = {
          role: 'assistant',
          content: fullContent,
          agentId: selectedAgent,
          timestamp: new Date(),
        };
        const finalMessages = [...newMessages, assistantEntry];
        setMessages(finalMessages);
        setSessionHistories((prev) => ({ ...prev, [selectedAgent]: finalMessages }));
      }
      setStreamingContent('');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError(String(e));
      }
    } finally {
      setStreaming(false);
    }
  }, [messages, selectedAgent, streaming]);

  const stopStream = () => {
    abortRef.current?.abort();
    if (streamingContent) {
      const entry: ChatEntry = {
        role: 'assistant',
        content: streamingContent + ' [dihentikan]',
        agentId: selectedAgent,
        timestamp: new Date(),
      };
      const finalMessages = [...messages, entry];
      setMessages(finalMessages);
      setSessionHistories((prev) => ({ ...prev, [selectedAgent]: finalMessages }));
    }
    setStreamingContent('');
    setStreaming(false);
  };

  const clearChat = () => {
    setMessages([]);
    setSessionHistories((prev) => ({ ...prev, [selectedAgent]: [] }));
    setStreamingContent('');
    setError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  };

  const currentAgent = agents.find((a) => a.id === selectedAgent);
  const colors = AGENT_COLORS[selectedAgent];

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-h-screen">
      {/* Config Dialog */}
      {showConfig && (
        <ConfigDialog
          onClose={() => setShowConfig(false)}
          onSaved={() => { setShowConfig(false); refreshStatus(); }}
        />
      )}

      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-6 py-4 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">PMO AI Agents</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Asisten cerdas berbasis AI untuk PMO delivery — Project Manager, Control, dan Quality
            </p>
          </div>
          <div className="flex items-center gap-2">
            {configured === true && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                AI Aktif
              </span>
            )}
            {configured === false && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-100 text-rose-700">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                Perlu Konfigurasi
              </span>
            )}
            <button
              onClick={() => setShowConfig(true)}
              className="text-xs px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50 text-slate-600"
            >
              ⚙️ Konfigurasi AI
            </button>
            <button
              onClick={loadContext}
              disabled={loadingContext}
              className="text-xs px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50 text-slate-600 disabled:opacity-50"
            >
              {loadingContext ? 'Memuat…' : '🔍 Lihat Konteks Data'}
            </button>
          </div>
        </div>

        {/* Agent tabs */}
        <div className="flex gap-2 mt-4">
          {agents.length === 0
            ? (['pm', 'control', 'quality'] as AgentId[]).map((id) => (
                <div key={id} className="h-10 w-48 bg-slate-100 animate-pulse rounded-lg" />
              ))
            : agents.map((agent) => {
                const agentColors = AGENT_COLORS[agent.id];
                const isActive = agent.id === selectedAgent;
                return (
                  <button
                    key={agent.id}
                    onClick={() => setSelectedAgent(agent.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
                      isActive
                        ? `${agentColors.bg} ${agentColors.border} ${agentColors.badge}`
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span>{AGENT_ICONS[agent.id]}</span>
                    <span>{agent.name}</span>
                    {sessionHistories[agent.id].length > 0 && (
                      <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${agentColors.badge}`}>
                        {Math.ceil(sessionHistories[agent.id].length / 2)}
                      </span>
                    )}
                  </button>
                );
              })}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Chat area */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Agent info banner */}
          {currentAgent && (
            <div className={`px-6 py-2.5 ${colors.bg} border-b ${colors.border} shrink-0`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${colors.dot}`}></span>
                  <span className="text-sm font-semibold text-slate-700">{currentAgent.name}</span>
                  <span className="text-xs text-slate-500">— {currentAgent.role}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 italic">{currentAgent.description}</span>
                  {messages.length > 0 && (
                    <button
                      onClick={clearChat}
                      className="text-xs text-slate-400 hover:text-slate-600 ml-2"
                    >
                      Hapus percakapan
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {/* Welcome state */}
            {messages.length === 0 && !streaming && (
              <div className="flex flex-col items-center justify-center h-full text-center py-12">
                <div className="text-5xl mb-4">{AGENT_ICONS[selectedAgent]}</div>
                <h3 className="text-lg font-semibold text-slate-700 mb-1">
                  {currentAgent?.name ?? 'PMO AI'}
                </h3>
                <p className="text-sm text-slate-500 max-w-md mb-6">
                  {currentAgent?.description}
                </p>
                {configured === false && (
                  <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg max-w-lg text-center">
                    <p className="text-sm font-semibold text-amber-800 mb-3">⚙️ PMO AI Belum Terkonfigurasi</p>
                    <p className="text-xs text-amber-700 mb-4">
                      Klik tombol di bawah untuk memasukkan API key Anda. Mendukung Groq (gratis), OpenAI, Gemini, atau Ollama lokal.
                    </p>
                    <button
                      onClick={() => setShowConfig(true)}
                      className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-lg transition-colors"
                    >
                      ⚙️ Konfigurasi API Key
                    </button>
                  </div>
                )}
                <div className="w-full max-w-lg">
                  <p className="text-xs text-slate-400 mb-2">💡 Coba pertanyaan ini:</p>
                  <div className="grid grid-cols-1 gap-2">
                    {AGENT_STARTERS[selectedAgent].map((s) => (
                      <button
                        key={s}
                        onClick={() => void sendMessage(s)}
                        disabled={streaming || configured === false}
                        className="text-left text-sm px-4 py-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Message list */}
            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} colors={colors} selectedAgent={selectedAgent} />
            ))}

            {/* Streaming bubble */}
            {streaming && (
              <div className={`flex gap-3`}>
                <div className={`flex-shrink-0 w-8 h-8 rounded-full ${colors.dot} flex items-center justify-center text-white text-sm`}>
                  {AGENT_ICONS[selectedAgent]}
                </div>
                <div className={`max-w-3xl rounded-2xl rounded-tl-sm px-4 py-3 ${colors.bg} ${colors.border} border`}>
                  {streamingContent ? (
                    <div className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                      {streamingContent}
                      <span className="inline-block w-1.5 h-4 bg-slate-500 ml-0.5 animate-pulse" />
                    </div>
                  ) : (
                    <div className="flex gap-1 items-center py-1">
                      <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:0ms]" />
                      <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:150ms]" />
                      <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:300ms]" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex gap-2 items-start p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-700">
                <span>⚠️</span>
                <span>{error}</span>
                <button onClick={() => setError(null)} className="ml-auto text-rose-400 hover:text-rose-600">✕</button>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input area */}
          <div className="border-t border-slate-200 bg-white px-6 py-4 shrink-0">
            <div className="flex gap-3 items-end">
              <div className="flex-1 relative">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Tanya ${currentAgent?.name ?? 'agen'}… (Enter untuk kirim, Shift+Enter baris baru)`}
                  rows={2}
                  disabled={streaming || configured === false}
                  className="w-full resize-none rounded-xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-400"
                />
              </div>
              {streaming ? (
                <button
                  onClick={stopStream}
                  className="shrink-0 px-4 py-3 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium transition-colors"
                >
                  ⏹ Stop
                </button>
              ) : (
                <button
                  onClick={() => void sendMessage(input)}
                  disabled={!input.trim() || configured === false}
                  className={`shrink-0 px-4 py-3 rounded-xl text-white text-sm font-medium transition-colors ${
                    input.trim() && configured !== false
                      ? `${colors.dot} hover:opacity-90`
                      : 'bg-slate-300 cursor-not-allowed'
                  }`}
                >
                  Kirim ↑
                </button>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-2">
              AI menggunakan data real-time dari sistem DeliverIQ. Verifikasi selalu sebelum mengambil keputusan penting.
            </p>
          </div>
        </div>

        {/* Context panel (collapsible sidebar) */}
        {contextView && (
          <div className="w-96 border-l border-slate-200 bg-slate-50 flex flex-col shrink-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white">
              <span className="text-sm font-semibold text-slate-700">🔍 Konteks Data Aktif</span>
              <button onClick={() => setContextView(null)} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <pre className="text-xs text-slate-700 font-mono whitespace-pre-wrap leading-relaxed">
                {contextView}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Message Bubble ─────────────────────────────────────────────────────────────
function MessageBubble({
  msg,
  colors,
  selectedAgent,
}: {
  msg: ChatEntry;
  colors: { bg: string; border: string; badge: string; dot: string };
  selectedAgent: AgentId;
}) {
  if (msg.role === 'user') {
    return (
      <div className="flex gap-3 justify-end">
        <div className="max-w-2xl rounded-2xl rounded-tr-sm px-4 py-3 bg-slate-800 text-white text-sm leading-relaxed whitespace-pre-wrap">
          {msg.content}
        </div>
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center text-white text-xs font-bold">
          U
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className={`flex-shrink-0 w-8 h-8 rounded-full ${colors.dot} flex items-center justify-center text-white text-sm`}>
        {AGENT_ICONS[selectedAgent]}
      </div>
      <div className={`max-w-3xl rounded-2xl rounded-tl-sm px-4 py-3 ${colors.bg} ${colors.border} border`}>
        <div className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
          {msg.content}
        </div>
        <div className="text-xs text-slate-400 mt-2">
          {msg.timestamp.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}

// ── Config Dialog ─────────────────────────────────────────────────────────────
function ConfigDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [selectedProvider, setSelectedProvider] = useState(PROVIDERS[0]);
  const [apiKey, setApiKey] = useState('');
  
  const [model, setModel] = useState<string>(PROVIDERS[0].model);
  const [baseUrl, setBaseUrl] = useState<string>(PROVIDERS[0].baseUrl);
  
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);

  const handleProviderChange = (providerId: string) => {
    const p = PROVIDERS.find((pr) => pr.id === providerId) ?? PROVIDERS[0];
    setSelectedProvider(p as any);
    
    setModel(p.model as string);
    setBaseUrl(p.baseUrl as string);
  };

  const handleSave = async () => {
    if (!apiKey.trim()) { setSaveError('Masukkan API key terlebih dahulu'); return; }
    setSaving(true);
    setSaveError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const r = await fetch(`${API_URL}/v1/pmo-ai/configure`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ apiKey: apiKey.trim(), model, baseUrl }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({ detail: 'Error' })) as { detail?: string };
        setSaveError(d.detail ?? 'Gagal menyimpan konfigurasi');
        return;
      }
      onSaved();
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-900">⚙️ Konfigurasi PMO AI</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Provider selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2">Pilih Provider AI</label>
            <div className="grid grid-cols-2 gap-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleProviderChange(p.id)}
                  className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors text-left ${
                    selectedProvider.id === p.id
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  <div>{p.name}</div>
                  {p.id === 'groq' && <div className="text-xs text-emerald-600 font-normal">✓ Gratis</div>}
                  {p.id === 'ollama' && <div className="text-xs text-slate-400 font-normal">Offline</div>}
                </button>
              ))}
            </div>
            {selectedProvider.hint && (
              <p className="text-xs text-slate-500 mt-2">
                💡 {selectedProvider.hint}
                {selectedProvider.keyUrl && (
                  <> — <a href={selectedProvider.keyUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Dapatkan API Key</a></>
                )}
              </p>
            )}
          </div>

          {/* API Key input */}
          {selectedProvider.id !== 'ollama' && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">API Key</label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={`Paste ${
