import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calculateAge } from './age';

describe('calculateAge', () => {
  beforeEach(() => {
    // Mock date to 2024-04-17 (today in this context)
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-04-17'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calculates age correctly for a birthday that already happened this year', () => {
    expect(calculateAge('1990-01-15')).toBe(34);
  });

  it('calculates age correctly for a birthday that has not happened yet this year', () => {
    expect(calculateAge('1990-12-15')).toBe(33);
  });

  it('calculates age correctly for a birthday today', () => {
    expect(calculateAge('1990-04-17')).toBe(34);
  });

  it('returns 0 for a baby born this year', () => {
    expect(calculateAge('2024-01-01')).toBe(0);
  });

  it('returns null for future dates', () => {
    expect(calculateAge('2025-01-01')).toBeNull();
  });

  it('returns null for invalid strings', () => {
    expect(calculateAge('not-a-date')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(calculateAge('')).toBeNull();
    expect(calculateAge(null)).toBeNull();
  });
});
