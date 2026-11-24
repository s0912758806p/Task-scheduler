import { describe, expect, it } from 'vitest';
import {
  addDays,
  diffDays,
  formatMonthDay,
  msToLocalISO,
  relativeDue,
  todayISO,
  weekdayLabel,
} from '@/lib/dates';

describe('dates', () => {
  it('todayISO uses the local calendar day (23:30 does not roll over)', () => {
    expect(todayISO(new Date(2026, 10, 23, 23, 30))).toBe('2026-11-23');
    expect(todayISO(new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01');
  });

  it('addDays crosses month and year boundaries', () => {
    expect(addDays('2026-11-23', 7)).toBe('2026-11-30');
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('addDays/diffDays are stable across DST transitions', () => {
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
    expect(diffDays('2026-03-10', '2026-03-01')).toBe(9);
    expect(diffDays('2026-11-05', '2026-10-30')).toBe(6);
  });

  it('diffDays is signed', () => {
    expect(diffDays('2026-11-24', '2026-11-23')).toBe(1);
    expect(diffDays('2026-11-22', '2026-11-23')).toBe(-1);
    expect(diffDays('2026-11-23', '2026-11-23')).toBe(0);
  });

  it('formats month/day and weekday', () => {
    expect(formatMonthDay('2026-11-22')).toBe('11月22日');
    expect(formatMonthDay('2026-01-05')).toBe('1月5日');
    expect(weekdayLabel('2026-11-22')).toBe('週日');
    expect(weekdayLabel('2026-11-23')).toBe('週一');
  });

  it('relativeDue', () => {
    expect(relativeDue('2026-11-22', '2026-11-23')).toBe('逾期 1 天');
    expect(relativeDue('2026-11-20', '2026-11-23')).toBe('逾期 3 天');
    expect(relativeDue('2026-11-23', '2026-11-23')).toBe('今天');
    expect(relativeDue('2026-11-24', '2026-11-23')).toBe('明天');
    expect(relativeDue('2026-11-28', '2026-11-23')).toBe('5 天後');
  });

  it('msToLocalISO converts using the given IANA time zone', () => {
    expect(msToLocalISO(Date.UTC(2026, 10, 23, 16, 30), 'Asia/Taipei')).toBe('2026-11-24');
    expect(msToLocalISO(Date.UTC(2026, 10, 23, 16, 30), 'UTC')).toBe('2026-11-23');
    expect(msToLocalISO(Date.UTC(2026, 10, 23, 3, 0), 'America/Los_Angeles')).toBe('2026-11-22');
  });
});
