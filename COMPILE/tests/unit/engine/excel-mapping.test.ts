// Unit tests — Excel column → entity mapping helpers (TC-IMP-U-001..004).

import { describe, it, expect } from 'vitest';
import {
  EXCEL_MAPPINGS,
  findMappingForSheet,
  normalizeHeader,
} from '../../../src/database/import/excel-mapping';

describe('normalizeHeader', () => {
  it('lowercases, trims, replaces spaces and dashes with underscore', () => {
    expect(normalizeHeader('  Order No ')).toBe('order_no');
    expect(normalizeHeader('Plan-RFS')).toBe('plan_rfs');
    expect(normalizeHeader('Site Code (Primary)')).toBe('site_code_primary');
  });
});

describe('findMappingForSheet', () => {
  it('returns the Order mapping when sheet name matches exactly', () => {
    const m = findMappingForSheet('Order');
    expect(m).toBeDefined();
    expect(m?.entity).toBe('Order');
    expect(m?.naturalKey).toEqual(['orderNumber']);
  });

  it('matches case-insensitively / partial', () => {
    const m = findMappingForSheet('SO_SOW');
    expect(m).toBeDefined();
    expect(m?.entity).toBe('SOW');
  });

  it('returns undefined for unknown sheet', () => {
    expect(findMappingForSheet('Quarterly Forecast')).toBeUndefined();
  });
});

describe('EXCEL_MAPPINGS structure', () => {
  it('every mapping declares entity, naturalKey, and at least one required field', () => {
    for (const map of EXCEL_MAPPINGS) {
      expect(map.entity).toBeTruthy();
      expect(map.naturalKey.length).toBeGreaterThan(0);
      expect(map.fields.some((f) => f.required)).toBe(true);
    }
  });

  it('Order mapping declares contractValue as required decimal (TC-IMP-U-001)', () => {
    const order = EXCEL_MAPPINGS.find((m) => m.entity === 'Order')!;
    const cv = order.fields.find((f) => f.target === 'contractValue');
    expect(cv).toMatchObject({ required: true, type: 'decimal' });
  });

  it('Sites mapping requires sowNumber + code (TC-IMP-U-002 surface)', () => {
    const sites = EXCEL_MAPPINGS.find((m) => m.entity === 'Site')!;
    const requiredTargets = sites.fields.filter((f) => f.required).map((f) => f.target);
    expect(requiredTargets).toEqual(expect.arrayContaining(['code', 'name', 'sowNumber']));
  });

  it('SOW mapping captures planRfsDate as required date (TC-IMP-U-003 boundary support)', () => {
    const sow = EXCEL_MAPPINGS.find((m) => m.entity === 'SOW')!;
    const planRfs = sow.fields.find((f) => f.target === 'planRfsDate');
    expect(planRfs).toMatchObject({ required: true, type: 'date' });
  });

  it('TC-IMP-U-004: orderNumber is the natural key, allowing dedup of duplicate rows', () => {
    const order = EXCEL_MAPPINGS.find((m) => m.entity === 'Order')!;
    expect(order.naturalKey).toEqual(['orderNumber']);
  });

  it('header alias resolution: order_no, no_order, order_number all map to orderNumber', () => {
    const order = EXCEL_MAPPINGS.find((m) => m.entity === 'Order')!;
    const f = order.fields.find((x) => x.target === 'orderNumber')!;
    const sources = Array.isArray(f.source) ? f.source : [f.source];
    expect(sources).toEqual(expect.arrayContaining(['order_no', 'no_order', 'order_number']));
  });
});
