import { describe, expect, it } from 'vitest';
import { parseQuickAdd } from '@/lib/quickAddParser';

const TODAY = '2026-11-23'; // Monday

describe('parseQuickAdd', () => {
  it('parses priority, tag, relative date and builds chips', () => {
    expect(parseQuickAdd('修 bug !高 #前端 明天', TODAY)).toEqual({
      title: '修 bug',
      priority: 1,
      tags: ['前端'],
      dueDate: '2026-11-24',
      chips: ['優先級 高', '#前端', '明天 · 11月24日'],
    });
  });

  it('accepts full-width markers and dedupes tags', () => {
    const r = parseQuickAdd('！緊急 ＃後端 ＃後端 報告', TODAY);
    expect(r.priority).toBe(0);
    expect(r.tags).toEqual(['後端']);
    expect(r.title).toBe('報告');
  });

  it('accepts numeric priorities', () => {
    expect(parseQuickAdd('a !3', TODAY).priority).toBe(3);
    expect(parseQuickAdd('a !0', TODAY).priority).toBe(0);
    expect(parseQuickAdd('a !中', TODAY).priority).toBe(2);
    expect(parseQuickAdd('a !低', TODAY).priority).toBe(3);
  });

  it('returns nulls and no chips for plain text', () => {
    expect(parseQuickAdd('  買牛奶   ', TODAY)).toEqual({
      title: '買牛奶',
      priority: null,
      tags: [],
      dueDate: null,
      chips: [],
    });
  });

  it('今天 / 後天', () => {
    expect(parseQuickAdd('交件 今天', TODAY).dueDate).toBe('2026-11-23');
    expect(parseQuickAdd('交件 後天', TODAY).dueDate).toBe('2026-11-25');
    expect(parseQuickAdd('交件 今天', TODAY).chips).toEqual(['今天 · 11月23日']);
  });

  it('下週X is the day in the Mon–Sun week starting next Monday', () => {
    expect(parseQuickAdd('下週一 開會', TODAY).dueDate).toBe('2026-11-30');
    expect(parseQuickAdd('下週日', TODAY).dueDate).toBe('2026-12-06');
    expect(parseQuickAdd('下週三', TODAY).dueDate).toBe('2026-12-02');
    // today = Sunday 2026-11-29 → next week starts tomorrow
    expect(parseQuickAdd('下週一', '2026-11-29').dueDate).toBe('2026-11-30');
    expect(parseQuickAdd('下週日', '2026-11-29').dueDate).toBe('2026-12-06');
    // today = Wednesday 2026-11-25
    expect(parseQuickAdd('下週一', '2026-11-25').dueDate).toBe('2026-11-30');
  });

  it('M/D uses this year unless already past', () => {
    expect(parseQuickAdd('11/20 回顧', TODAY).dueDate).toBe('2027-11-20');
    expect(parseQuickAdd('12/1', TODAY).dueDate).toBe('2026-12-01');
    expect(parseQuickAdd('11/23 today', TODAY).dueDate).toBe('2026-11-23');
  });

  it('invalid M/D stays in the title', () => {
    const a = parseQuickAdd('2/30 報稅', TODAY);
    expect(a.dueDate).toBeNull();
    expect(a.title).toBe('2/30 報稅');
    const b = parseQuickAdd('13/1 x', TODAY);
    expect(b.dueDate).toBeNull();
    expect(b.title).toBe('13/1 x');
  });

  it('# and ! must follow start or whitespace', () => {
    const a = parseQuickAdd('學 C# 語言', TODAY);
    expect(a.tags).toEqual([]);
    expect(a.title).toBe('學 C# 語言');
    const b = parseQuickAdd('hi!高 yo', TODAY);
    expect(b.priority).toBeNull();
    expect(b.title).toBe('hi!高 yo');
  });

  it('last token of the same kind wins; all removed from title', () => {
    const r = parseQuickAdd('x !高 !低 明天 後天', TODAY);
    expect(r.priority).toBe(3);
    expect(r.dueDate).toBe('2026-11-25');
    expect(r.title).toBe('x');
  });

  it('empty title when only tokens', () => {
    expect(parseQuickAdd('!高 #x', TODAY).title).toBe('');
  });

  it('collapses whitespace left by removed tokens', () => {
    expect(parseQuickAdd('寫   #a   文件  明天   !2', TODAY).title).toBe('寫 文件');
  });
});
