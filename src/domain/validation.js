import { DomainError } from './errors.js';

// Shared input checks used by the whole domain layer.
// Every failure throws a DomainError with code VALIDATION.

export function requireText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new DomainError('VALIDATION', `${field} must be a non-empty string`);
  }
  return value.trim();
}

// Money and counts are WHOLE numbers (cents, seats), never decimals.
export function requireWholeNumber(value, field, min) {
  if (!Number.isInteger(value) || value < min) {
    throw new DomainError('VALIDATION', `${field} must be a whole number >= ${min}`);
  }
  return value;
}

// Accepts "2026-12-05" or "2026-12-05T17:00:00Z" (ISO 8601).
// Groups: 1=year 2=month 3=day, 4=hour (only if a time is present).
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:T([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?)?$/;

// Returns { ms, dateOnly }. Rejects things Date.parse would quietly accept,
// such as 2026-02-30 (which JavaScript rolls over to 2 March).
export function parseDate(value, field) {
  const bad = () => new DomainError('VALIDATION', `${field} must be a real ISO date`);
  if (typeof value !== 'string') throw bad();
  const m = ISO_DATE.exec(value.trim());
  if (!m) throw bad();

  // Round-trip check: build the date and confirm it kept the same y/m/d.
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) {
    throw bad();
  }

  const ms = Date.parse(value.trim());
  if (Number.isNaN(ms)) throw bad();
  return { ms, dateOnly: m[4] === undefined };
}
