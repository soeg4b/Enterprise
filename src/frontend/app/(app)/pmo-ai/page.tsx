'use client';

import React, { useEffect, useRef, useState } from 'react';
import { API_URL, getAccessToken } from '../../../lib/api';

// ── Configuration & Constants ────────────────────────────────────────────────
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
];

type AgentId = 'pm' | 'control' | 'quality';

interface ChatEntry {
  role: 'user' | 'assistant';
  content: string;
  agentId?: AgentId;
  timestamp: Date;
}

const AGENT_ICONS: Record<AgentId, string> = { pm: '🎯', control: '📊', quality: '✅' };

// ── Sub-Component: Config Dialog ─────────────────────────────────────────────
function ConfigDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [selectedProvider, setSelectedProvider] = useState<any>(PROVIDERS[0]);
  const [apiKey, setApiKey] = useState('');
  
  const [model, setModel] = useState<string>(PROVIDERS[0]?.model || '');
  const [baseUrl, setBaseUrl] = useState<string>(PROVIDERS[0]?.baseUrl || '');
  
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);

  const handleProviderChange = (providerId: string) => {
    const p = PROVIDERS.find((pr) => pr.id === providerId) ?? PROVIDERS[0];
    if (p) {
      setSelectedProvider(p);
      setModel(p.model || '');
      setBaseUrl(p.baseUrl || '');
    }
  };

  const handleSave = async () => {
    if (!apiKey.trim()) { setSaveError('Masukkan API key terlebih dahulu'); return; }
    setSaving(true);
    try {
      const token = getAccessToken();
      const r = await fetch(`${API_URL}/v1/pmo-ai/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: JSON.stringify({ apiKey: apiKey.trim(), model, baseUrl }),
      });
      if (!r.ok) throw new Error('Gagal menyimpan konfigurasi');
      onSaved();
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
          <h2 className="font-bold">⚙️ Konfigurasi PMO AI</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {PROVIDERS.map((p) => (
              <button key={p.id} onClick={() => handleProviderChange(p.id)} className={`p-2 text-xs border rounded-lg ${selectedProvider?.id === p.id ? 'bg-blue-50 border-blue-500' : ''}`}>
                {p.name}
              </button>
            ))}
          </div>
          <input type={showKey ? 'text' : 'password'} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="API Key" className="w-full border p-2 rounded text-sm" />
          <button onClick={() => void handleSave()} disabled={saving} className="w-full bg-blue-600 text-white p-2 rounded font-bold disabled:bg-slate-300">
            {saving ? 'Menyimpan...' : 'Simpan Konfigurasi'}
          </button>
          {saveError && <p className="text-xs text-red-500">{saveError}</p>}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function PmoAiPage() {
  const [selectedAgent, setSelectedAgent] = useState<AgentId>('pm');
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [sessionHistories, setSessionHistories] = useState<Record<AgentId, ChatEntry[]>>({ pm: [], control: [], quality: [] });

  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, streamingContent]);
  useEffect(() => { setMessages(sessionHistories[selectedAgent]); setError(null); }, [selectedAgent, sessionHistories]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || streaming) return;
    setError(null);
    const userEntry: ChatEntry = { role: 'user', content: text.trim(), timestamp: new Date() };
    const newMessages = [...messages, userEntry];
    setMessages(newMessages);
    setInput('');
    setStreaming(true);

    const token = getAccessToken();
    abortRef.current = new AbortController();

    try {
      const response = await fetch(`${API_URL}/v1/pmo-ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: JSON.stringify({ agentId: selectedAgent, message: text.trim(), history: messages.slice(-10).map(m => ({ role: m.role, content: m.content })), includeContext: true }),
        signal: abortRef.current.signal,
      });

      if (!response.body) throw new Error('Tidak ada respon dari server AI');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data:')) {
            try {
              const parsed = JSON.parse(line.slice(5));
              if (parsed.type === 'token') {
                fullContent += parsed.content;
                setStreamingContent(fullContent);
              }
            } catch {
              // Abaikan format JSON yang tidak valid dalam stream
            }
          }
        }
      }

      const assistantEntry: ChatEntry = { role: 'assistant', content: fullContent, agentId: selectedAgent, timestamp: new Date() };
      setMessages(prev => [...prev, assistantEntry]);
      setSessionHistories(prev => ({ ...prev, [selectedAgent]: [...prev[selectedAgent], userEntry, assistantEntry] }));
      setStreamingContent('');
    } catch (e) {
      setError(String(e));
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-slate-50">
      {showConfig && <ConfigDialog onClose={() => setShowConfig(false)} onSaved={() => setShowConfig(false)} />}
      
      <div className="bg-white border-b p-4 flex justify-between items-center shrink-0">
        <h1 className="font-bold text-lg">PMO AI Dashboard - DeliverIQ</h1>
        <button onClick={() => setShowConfig(true)} className="text-xs border p-2 rounded hover:bg-slate-50">⚙️ Config AI</button>
      </div>

      {error && (
        <div className="bg-red-50 border-b border-red-200 p-2 text-center text-xs text-red-600 font-semibold">
          ⚠️ {error}
        </div>
      )}

      <div className="flex gap-2 p-4 shrink-0 overflow-x-auto">
        {(['pm', 'control', 'quality'] as AgentId[]).map((id) => (
          <button key={id} onClick={() => setSelectedAgent(id)} className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${selectedAgent === id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200'}`}>
            {AGENT_ICONS[id]} {id.toUpperCase()} Agent
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${m.role === 'user' ? 'bg-slate-800 text-white rounded-tr-none' : 'bg-white border text-slate-800 rounded-tl-none'}`}>
              {m.content}
            </div>
          </div>
        ))}
        {streamingContent && (
          <div className="flex justify-start">
            <div className={`max-w-[80%] p-3 rounded-2xl text-sm bg-white border text-slate-800 rounded-tl-none animate-pulse`}>
              {streamingContent}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="p-4 bg-white border-t shrink-0">
        <div className="flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void sendMessage(input)} placeholder="Tanya AI tentang status project..." className="flex-1 border rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button onClick={() => void sendMessage(input)} disabled={streaming || !input.trim()} className="bg-blue-600 text-white px-6 py-2 rounded-xl text-sm font-bold disabled:bg-slate-300">Kirim</button>
        </div>
      </div>
    </div>
  );
}
