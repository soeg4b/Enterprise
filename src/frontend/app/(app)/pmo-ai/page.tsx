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
    'Identifikasi risiko penolakan customer di project
