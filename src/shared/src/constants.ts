import type { MilestoneType, OverallStatus } from './types';

// Milestone weights (sum = 100) — per Data agent §6.1
export const MILESTONE_WEIGHTS: Record<MilestoneType, number> = {
  STIP_2_4: 5,
  STIP_10: 5,
  DESIGN: 10,
  PROCUREMENT: 15,
  KOM: 5,
  MATERIAL_READY: 15,
  MOS: 5,
  INSTALLATION: 25,
  RFS: 15,
  HANDOVER: 0,
};

export const MILESTONE_SEQUENCE: MilestoneType[] = [
  'STIP_2_4',
  'STIP_10',
  'DESIGN',
  'PROCUREMENT',
  'KOM',
  'MATERIAL_READY',
  'MOS',
  'INSTALLATION',
  'RFS',
  'HANDOVER',
];

export const MILESTONE_LABELS: Record<MilestoneType, string> = {
  STIP_2_4: 'Team Preparation',
  STIP_10: 'CME Preparation',
  DESIGN: 'Site Survey & Design',
  PROCUREMENT: 'Procurement',
  KOM: 'Kick-Off Meeting',
  MATERIAL_READY: 'Material Ready',
  MOS: 'CME Implementation',
  INSTALLATION: 'Installation & Integration',
  RFS: 'Testing & RFS',
  HANDOVER: 'Handover & Closure',
};

export const MILESTONE_DESCRIPTIONS: Record<MilestoneType, string> = {
  STIP_2_4: 'Form delivery team, assign PM, FE, vendor PIC; align on scope.',
  STIP_10: 'Civil/Mechanical/Electrical preparation: permit, BOQ, safety plan.',
  DESIGN: 'Site survey, LLD/HLD, BoM finalization.',
  PROCUREMENT: 'PO release to vendor, material sourcing.',
  KOM: 'Kick-off meeting with customer & partners.',
  MATERIAL_READY: 'Material received and ready at warehouse / site.',
  MOS: 'CME work execution: civil, power, rack, cabling.',
  INSTALLATION: 'Active equipment installation, configuration, integration.',
  RFS: 'Service test & customer acceptance — Ready For Service.',
  HANDOVER: 'Documentation, handover to operations, project closure.',
};

// Status thresholds — Data agent §7.3
export const STATUS_THRESHOLDS = {
  AT_RISK_GAP_MIN_DAYS: 1,
  AT_RISK_GAP_MAX_DAYS: 7,
  AT_RISK_OVERDUE_DAYS: 3, // any open milestone overdue beyond this -> at risk
  DELAY_GAP_DAYS: 7,
  DELAY_OVERDUE_DAYS: 7,
  RFS_IMMINENT_WINDOW_DAYS: 14,
};

// Default offsets (days before plan_rfs) for spawned milestones — illustrative.
// Real offsets come from a config table in production.
export const MILESTONE_PLAN_OFFSETS_DAYS: Record<MilestoneType, number> = {
  STIP_2_4: 60,
  STIP_10: 55,
  DESIGN: 45,
  PROCUREMENT: 35,
  KOM: 30,
  MATERIAL_READY: 20,
  MOS: 15,
  INSTALLATION: 10,
  RFS: 0,
  HANDOVER: -3,
};

export const STATUS_COLORS: Record<OverallStatus, { bg: string; text: string; label: string }> = {
  ON_TRACK: { bg: '#10b981', text: '#ffffff', label: 'On Track' },
  AT_RISK: { bg: '#f59e0b', text: '#1f2937', label: 'At Risk' },
  DELAY: { bg: '#ef4444', text: '#ffffff', label: 'Delay' },
  UNKNOWN: { bg: '#94a3b8', text: '#ffffff', label: 'Unknown' },
};

export const API_BASE_PATH = '/v1';
