// Pure date helpers. Dates are `YYYY-MM-DD` strings; all arithmetic goes through the
// local `new Date(y, m - 1, d)` constructor (never UTC-parsing an ISO date string) so a
// calendar day never shifts with the viewer's time zone. "Today" is only ever computed
// in the browser (see global constraints).

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split('-').map(Number);
  return [y, m, d];
}

function fromParts(date: Date): string {
  const y = String(date.getFullYear()).padStart(4, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Local calendar day of `now`. */
export function todayISO(now: Date = new Date()): string {
  return fromParts(now);
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = parts(iso);
  return fromParts(new Date(y, m - 1, d + n));
}

/** Whole days from `fromISO` to `iso` (positive when `iso` is later). DST-safe. */
export function diffDays(iso: string, fromISO: string): number {
  const [y1, m1, d1] = parts(iso);
  const [y2, m2, d2] = parts(fromISO);
  return Math.round((Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2)) / 86_400_000);
}

export function formatMonthDay(iso: string): string {
  const [, m, d] = parts(iso);
  return `${m}月${d}日`;
}

export function weekdayLabel(iso: string): string {
  const [y, m, d] = parts(iso);
  return `週${WEEKDAYS[new Date(y, m - 1, d).getDay()]}`;
}

export function relativeDue(iso: string, today: string): string {
  const diff = diffDays(iso, today);
  if (diff < 0) return `逾期 ${-diff} 天`;
  if (diff === 0) return '今天';
  if (diff === 1) return '明天';
  return `${diff} 天後`;
}

/** Calendar day of a millisecond timestamp in the given IANA time zone. */
export function msToLocalISO(ms: number, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const get = (type: string) => fmt.formatToParts(new Date(ms)).find((p) => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
