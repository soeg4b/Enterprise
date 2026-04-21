// Decimal/serialisation helpers — Prisma Decimal -> string for JSON safety.

import { Prisma } from '@prisma/client';

export function decToString(value: unknown): string {
  if (value === null || value === undefined) return '0';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return value.toString();
  if (value instanceof Prisma.Decimal) return value.toString();
  // Fallback for objects that have toString
  return String(value);
}

export function dateToIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

// Recursively serialise an object replacing Decimal/Date for JSON.
export function serialise<T>(input: T): T {
  if (input === null || input === undefined) return input;
  if (input instanceof Date) return input.toISOString() as unknown as T;
  if (input instanceof Prisma.Decimal) return input.toString() as unknown as T;
  if (Array.isArray(input)) return input.map((v) => serialise(v)) as unknown as T;
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[k] = serialise(v);
    }
    return out as T;
  }
  return input;
}
