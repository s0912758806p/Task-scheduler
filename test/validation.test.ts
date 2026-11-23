import { describe, expect, it } from 'vitest';
import { batchRequest, boardCreate, exportV2, taskCreate, taskUpdate } from '@/lib/validation';

const boardId = crypto.randomUUID();

describe('taskCreate', () => {
  it('trims, collapses newlines in the title and cleans tags', () => {
    const r = taskCreate.parse({ boardId, title: '  修\nbug  ', tags: [' 前端 ', '前端', ''] });
    expect(r.title).toBe('修 bug');
    expect(r.tags).toEqual(['前端']);
  });
  it('rejects blank and over-long titles, accepts emoji', () => {
    expect(taskCreate.safeParse({ boardId, title: '   ' }).success).toBe(false);
    expect(taskCreate.safeParse({ boardId, title: 'a'.repeat(201) }).success).toBe(false);
    expect(taskCreate.safeParse({ boardId, title: 'a'.repeat(200) }).success).toBe(true);
    expect(taskCreate.parse({ boardId, title: '🚀 上線' }).title).toBe('🚀 上線');
  });
  it('enforces tag, subtask, date and priority limits', () => {
    expect(taskCreate.safeParse({ boardId, title: 'x', tags: ['a'.repeat(31)] }).success).toBe(false);
    const many = Array.from({ length: 21 }, (_, i) => `t${i}`);
    expect(taskCreate.safeParse({ boardId, title: 'x', tags: many }).success).toBe(false);
    const subs = Array.from({ length: 51 }, () => ({ id: crypto.randomUUID(), title: 's', done: false }));
    expect(taskCreate.safeParse({ boardId, title: 'x', subtasks: subs }).success).toBe(false);
    expect(taskCreate.safeParse({ boardId, title: 'x', dueDate: '2026-02-30' }).success).toBe(false);
    expect(taskCreate.safeParse({ boardId, title: 'x', dueDate: '2026-02-28' }).success).toBe(true);
    expect(taskCreate.safeParse({ boardId, title: 'x', dueDate: null }).success).toBe(true);
    expect(taskCreate.safeParse({ boardId, title: 'x', priority: 4 }).success).toBe(false);
    expect(taskCreate.safeParse({ boardId, title: 'x', description: 'd'.repeat(5001) }).success).toBe(false);
  });
});

describe('taskUpdate', () => {
  it('rejects an empty object and accepts deletedAt: null', () => {
    expect(taskUpdate.safeParse({}).success).toBe(false);
    expect(taskUpdate.safeParse({ deletedAt: null }).success).toBe(true);
    expect(taskUpdate.safeParse({ deletedAt: 'x' }).success).toBe(false);
  });
});

describe('batchRequest', () => {
  const ids = [crypto.randomUUID()];
  it('requires status for move', () => {
    expect(batchRequest.safeParse({ ids, op: 'move' }).success).toBe(false);
    expect(batchRequest.safeParse({ ids, op: 'move', status: 'done' }).success).toBe(true);
    expect(batchRequest.safeParse({ ids, op: 'delete' }).success).toBe(true);
  });
  it('bounds ids to 1..500', () => {
    expect(batchRequest.safeParse({ ids: [], op: 'delete' }).success).toBe(false);
    const big = Array.from({ length: 501 }, () => crypto.randomUUID());
    expect(batchRequest.safeParse({ ids: big, op: 'delete' }).success).toBe(false);
  });
});

describe('boardCreate / exportV2', () => {
  it('validates board name length', () => {
    expect(boardCreate.safeParse({ name: ' ' }).success).toBe(false);
    expect(boardCreate.safeParse({ name: 'a'.repeat(61) }).success).toBe(false);
    expect(boardCreate.parse({ name: ' 工作 ' }).name).toBe('工作');
  });
  it('accepts exactly the v2 shape', () => {
    const ok = {
      format: 'task-scheduler',
      version: 2,
      exportedAt: '2026-11-23T00:00:00.000Z',
      board: { name: '工作' },
      tasks: [
        {
          id: 'a', title: 't', description: '', status: 'todo', priority: 2, dueDate: null,
          tags: [], subtasks: [], dependsOn: [], createdAt: '2026-11-23T00:00:00.000Z',
          completedAt: null, position: 1024,
        },
      ],
    };
    expect(exportV2.safeParse(ok).success).toBe(true);
    expect(exportV2.safeParse({ ...ok, version: 1 }).success).toBe(false);
    expect(exportV2.safeParse({ ...ok, format: 'x' }).success).toBe(false);
  });
});
