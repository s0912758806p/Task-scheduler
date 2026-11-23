import { describe, expect, it } from 'vitest';
import { SAMPLE_TASKS } from '@/lib/sampleTasks';

describe('SAMPLE_TASKS', () => {
  it('has 11 entries', () => {
    expect(SAMPLE_TASKS).toHaveLength(11);
  });

  it('every priority is 0-3', () => {
    for (const t of SAMPLE_TASKS) expect([0, 1, 2, 3]).toContain(t.priority);
  });

  it('requirements analysis is overdue by one day', () => {
    expect(SAMPLE_TASKS.find((t) => t.title === '完成專案需求分析')?.dueInDays).toBe(-1);
  });

  it('done tasks carry completedInDays, others null', () => {
    for (const t of SAMPLE_TASKS) {
      if (t.status === 'done') expect(t.completedInDays).toBe(t.dueInDays);
      else expect(t.completedInDays).toBeNull();
    }
  });

  it('dependsOnTitles reference existing titles', () => {
    const titles = new Set(SAMPLE_TASKS.map((t) => t.title));
    const cicd = SAMPLE_TASKS.find((t) => t.title === '建立 CI/CD 流程');
    expect(cicd?.dependsOnTitles).toEqual(['撰寫 API 規格文件']);
    for (const t of SAMPLE_TASKS) for (const d of t.dependsOnTitles ?? []) expect(titles.has(d)).toBe(true);
  });
});
