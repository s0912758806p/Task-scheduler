import { describe, expect, it } from 'vitest';
import {
  EMPTY_FILTERS,
  boardStats,
  columnTasks,
  completedWithin,
  filterTasks,
  focusGroups,
  indexById,
  isBlocked,
  isDueToday,
  isOverdue,
  matchesChip,
  openBlockers,
  pickSuggestion,
  sortTasks,
} from '@/lib/taskQueries';
import { TODAY, sampleTasksAsTasks } from './fixtures/tasks';

const tasks = sampleTasksAsTasks();
const byId = indexById(tasks);
const titles = (ts: { title: string }[]) => ts.map((t) => t.title);
const byTitle = (title: string) => tasks.find((t) => t.title === title)!;

describe('taskQueries', () => {
  it('boardStats counts totals, percentage and chips', () => {
    expect(boardStats(tasks, byId, TODAY)).toEqual({
      total: 11,
      done: 3,
      pct: 27,
      chips: { overdue: 2, today: 1, urgent: 3, blocked: 1 },
    });
    expect(boardStats([], byId, TODAY).pct).toBe(0);
  });

  it('focusGroups follows spec §9', () => {
    const g = focusGroups(tasks, byId, TODAY);
    expect(titles(g.overdue)).toEqual(['實作使用者認證模組', '完成專案需求分析']);
    expect(titles(g.today)).toEqual(['安全性稽核']);
    expect(titles(g.blocked)).toEqual(['建立 CI/CD 流程']);
    expect(titles(g.week)).not.toContain('建立 CI/CD 流程');
    expect(titles(g.week)).toEqual(['設計資料庫結構', '撰寫 API 規格文件', 'UI 元件庫建置']);
  });

  it('a blocked task can also be overdue', () => {
    const blocked = { ...byTitle('建立 CI/CD 流程'), dueDate: '2026-11-20' };
    const all = tasks.map((t) => (t.id === blocked.id ? blocked : t));
    const g = focusGroups(all, indexById(all), TODAY);
    expect(titles(g.overdue)).toContain('建立 CI/CD 流程');
    expect(titles(g.blocked)).toContain('建立 CI/CD 流程');
  });

  it('pickSuggestion prefers the highest-priority overdue, else due today', () => {
    expect(pickSuggestion(focusGroups(tasks, byId, TODAY))?.title).toBe('實作使用者認證模組');
    expect(pickSuggestion({ overdue: [], today: [byTitle('安全性稽核')], week: [], blocked: [] })?.title).toBe('安全性稽核');
    expect(pickSuggestion({ overdue: [], today: [], week: [], blocked: [] })).toBeNull();
  });

  it('a soft-deleted (missing) or done prerequisite does not block', () => {
    const ci = byTitle('建立 CI/CD 流程');
    expect(isBlocked(ci, byId)).toBe(true);
    expect(openBlockers(ci, byId).map((t) => t.title)).toEqual(['撰寫 API 規格文件']);
    const withoutApi = indexById(tasks.filter((t) => t.title !== '撰寫 API 規格文件'));
    expect(isBlocked(ci, withoutApi)).toBe(false);
    const apiDone = indexById(tasks.map((t) => (t.title === '撰寫 API 規格文件' ? { ...t, status: 'done' as const } : t)));
    expect(isBlocked(ci, apiDone)).toBe(false);
  });

  it('overdue / due-today predicates ignore done tasks and missing dates', () => {
    expect(isOverdue(byTitle('完成專案需求分析'), TODAY)).toBe(true);
    expect(isOverdue(byTitle('建立前端框架'), TODAY)).toBe(false);
    expect(isDueToday(byTitle('安全性稽核'), TODAY)).toBe(true);
    expect(matchesChip(byTitle('建立前端框架'), 'overdue', byId, TODAY)).toBe(false);
  });

  it('filterTasks searches title, description and tags case-insensitively', () => {
    const r = filterTasks(tasks, { ...EMPTY_FILTERS, search: 'API' }, byId, TODAY);
    expect(titles(r)).toContain('撰寫 API 規格文件');
    expect(titles(filterTasks(tasks, { ...EMPTY_FILTERS, search: 'devops' }, byId, TODAY))).toContain('建立 CI/CD 流程');
    expect(titles(filterTasks(tasks, { ...EMPTY_FILTERS, search: 'oauth' }, byId, TODAY))).toContain('實作使用者認證模組');
  });

  it('filterTasks chip urgent excludes done tasks', () => {
    const done = { ...byTitle('安全性稽核'), status: 'done' as const };
    const all = tasks.map((t) => (t.id === done.id ? done : t));
    const r = filterTasks(all, { ...EMPTY_FILTERS, chip: 'urgent' }, indexById(all), TODAY);
    expect(r.every((t) => t.status !== 'done' && t.priority === 0)).toBe(true);
    expect(r).toHaveLength(2);
  });

  it('filterTasks dueRange and tags and priority', () => {
    const f = (dueRange: 'overdue' | 'today' | 'week' | 'future') =>
      titles(filterTasks(tasks, { ...EMPTY_FILTERS, dueRange }, byId, TODAY));
    expect(f('overdue')).toEqual(expect.arrayContaining(['完成專案需求分析', '建立前端框架']));
    expect(f('today')).toEqual(['安全性稽核']);
    expect(f('week')).toContain('撰寫 API 規格文件');
    expect(f('week')).not.toContain('效能優化 — 首頁載入速度'); // +8 days is future
    expect(f('future')).toEqual(expect.arrayContaining(['建立 CI/CD 流程', '效能優化 — 首頁載入速度']));
    expect(titles(filterTasks(tasks, { ...EMPTY_FILTERS, priority: 0 }, byId, TODAY))).toHaveLength(3);
    expect(titles(filterTasks(tasks, { ...EMPTY_FILTERS, tags: ['DevOps'] }, byId, TODAY))).toHaveLength(2);
  });

  it('sortTasks orders by priority, dueDate (nulls last) and manual, without mutating', () => {
    const withNull = [...tasks, { ...tasks[0], id: 'x', title: '無截止日', dueDate: null, position: 1 }];
    const before = withNull.map((t) => t.id);
    const byDue = sortTasks(withNull, 'dueDate');
    expect(byDue[byDue.length - 1].title).toBe('無截止日');
    expect(withNull.map((t) => t.id)).toEqual(before);
    const byPri = sortTasks(tasks, 'priority');
    expect(byPri.map((t) => t.priority)).toEqual([...byPri.map((t) => t.priority)].sort((a, b) => a - b));
    expect(sortTasks(tasks, 'manual').map((t) => t.id)).toEqual(tasks.map((t) => t.id));
  });

  it('columnTasks returns one status ordered by position', () => {
    const shuffled = [...tasks].reverse();
    const col = columnTasks(shuffled, 'in-progress');
    expect(col).toHaveLength(3);
    expect(col.map((t) => t.position)).toEqual([...col.map((t) => t.position)].sort((a, b) => a - b));
  });

  it('completedWithin counts done tasks inside the window', () => {
    const now = new Date(2026, 10, 23, 18, 0, 0);
    expect(completedWithin(tasks, 7, now)).toBe(1); // -3 days; -7 days at noon is just outside
    expect(completedWithin(tasks, 30, now)).toBe(3);
  });
});
