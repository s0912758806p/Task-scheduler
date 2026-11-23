// Smart quick-add parser (spec §9). Pure: `today` is passed in by the browser.
//   !緊急 !高 !中 !低 / !0–!3 (also full-width ！)  → priority
//   #tag (also ＃)                                  → tags (deduped)
//   今天 明天 後天 / 下週一…下週日 / M/D            → due date
// `#` and `!` tokens must follow start-of-string or whitespace (so `C#` stays in the title).
// When a kind of token repeats the last one wins; every recognised token leaves the title.
// Invalid M/D (2/30, 13/1) is not a date and stays in the title.
import { addDays, diffDays, formatMonthDay, relativeDue } from './dates';
import type { Priority } from './types';

export interface QuickAddResult {
  title: string;
  priority: Priority | null;
  tags: string[];
  dueDate: string | null;
  chips: string[];
}

const PRIORITY_WORDS: Record<string, Priority> = { 緊急: 0, 高: 1, 中: 2, 低: 3 };
const PRIORITY_LABELS = ['緊急', '高', '中', '低'];
const WEEKDAY_INDEX: Record<string, number> = { 一: 0, 二: 1, 三: 2, 四: 3, 五: 4, 六: 5, 日: 6 };

const PRIORITY_RE = /(?<=^|\s)[!！](緊急|高|中|低|[0-3])(?=\s|$)/g;
const TAG_RE = /(?<=^|\s)[#＃]([^\s#＃]+)/g;
const DATE_RE = /下週([一二三四五六日])|今天|明天|後天|(?<![\d/])(\d{1,2})\/(\d{1,2})(?![\d/])/g;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function validMonthDay(year: number, month: number, day: number): boolean {
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

function resolveMonthDay(month: number, day: number, today: string): string | null {
  const year = Number(today.slice(0, 4));
  for (let y = year; y <= year + 4; y++) {
    if (!validMonthDay(y, month, day)) continue;
    const iso = `${String(y).padStart(4, '0')}-${pad(month)}-${pad(day)}`;
    if (diffDays(iso, today) >= 0) return iso;
  }
  return null;
}

function nextWeekDay(weekdayIdx: number, today: string): string {
  const [y, m, d] = today.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay(); // 0 = Sunday
  const daysToNextMonday = (8 - dow) % 7 || 7;
  return addDays(today, daysToNextMonday + weekdayIdx);
}

export function parseQuickAdd(input: string, today: string): QuickAddResult {
  let priority: Priority | null = null;
  const tags: string[] = [];
  let dueDate: string | null = null;

  let rest = input.replace(PRIORITY_RE, (_m, p: string) => {
    priority = (p in PRIORITY_WORDS ? PRIORITY_WORDS[p] : Number(p)) as Priority;
    return ' ';
  });

  rest = rest.replace(TAG_RE, (_m, tag: string) => {
    if (!tags.includes(tag)) tags.push(tag);
    return ' ';
  });

  rest = rest.replace(DATE_RE, (match, weekday?: string, month?: string, day?: string) => {
    if (weekday) {
      dueDate = nextWeekDay(WEEKDAY_INDEX[weekday], today);
    } else if (match === '今天') {
      dueDate = today;
    } else if (match === '明天') {
      dueDate = addDays(today, 1);
    } else if (match === '後天') {
      dueDate = addDays(today, 2);
    } else {
      const resolved = resolveMonthDay(Number(month), Number(day), today);
      if (resolved === null) return match; // invalid date: leave in the title
      dueDate = resolved;
    }
    return ' ';
  });

  const chips: string[] = [];
  if (priority !== null) chips.push(`優先級 ${PRIORITY_LABELS[priority]}`);
  for (const tag of tags) chips.push(`#${tag}`);
  if (dueDate !== null) chips.push(`${relativeDue(dueDate, today)} · ${formatMonthDay(dueDate)}`);

  return {
    title: rest.replace(/\s+/g, ' ').trim(),
    priority,
    tags,
    dueDate,
    chips,
  };
}
