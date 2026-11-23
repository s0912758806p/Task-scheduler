import { describe, expect, it } from 'vitest';
import { normalizeImportFile, normalizeLocalStorage } from '@/lib/legacy';
import { ApiError } from '@/server/errors';

const TZ = 'Asia/Taipei';
const base = { status: 'todo', priority: 2, createdAt: 1700000000000 };

describe('normalizeImportFile (legacy array)', () => {
  it('converts ms dueDate by time zone and keeps dependsOn source ids', () => {
    // 2026-03-10 23:30 in Taipei == 2026-03-10T15:30Z
    const due = Date.UTC(2026, 2, 10, 15, 30);
    const r = normalizeImportFile(
      [
        { ...base, id: '4', boardId: 'default', title: 'A' },
        { ...base, id: '5', boardId: 'default', title: 'B', dueDate: due, dependsOn: ['4'] },
      ],
      TZ,
    );
    expect(r.tasks[1].dueDate).toBe('2026-03-10');
    expect(r.tasks[1].dependsOnSourceIds).toEqual(['4']);
    expect(r.tasks[0].position).toBeLessThan(r.tasks[1].position);
    expect(r.warnings).toEqual([]);
  });
  it('repairs invalid priority and status with warnings', () => {
    const r = normalizeImportFile(
      [{ id: '1', title: 'x' }, { ...base, id: '2', title: 'y', priority: 9, status: 'weird' }],
      TZ,
    );
    expect(r.tasks[1].priority).toBe(2);
    expect(r.tasks[1].status).toBe('todo');
    expect(r.warnings).toContain('第 2 筆：優先級無效，已設為「中」');
    expect(r.warnings).toContain('第 2 筆：狀態無效，已設為「待辦」');
  });
  it('skips blank titles, truncates long ones, keeps completedAt only when done', () => {
    const r = normalizeImportFile(
      [
        { ...base, id: '1', title: '  ' },
        { ...base, id: '2', title: 'a'.repeat(250), description: 'd'.repeat(5001) },
        { ...base, id: '3', title: 'done', status: 'done', completedAt: 1700000100000 },
        { ...base, id: '4', title: 'open', completedAt: 1700000100000 },
      ],
      TZ,
    );
    expect(r.tasks.map((t) => t.sourceId)).toEqual(['2', '3', '4']);
    expect(r.tasks[0].title).toHaveLength(200);
    expect(r.tasks[0].description).toHaveLength(5000);
    expect(r.tasks[1].completedAt).toBe(new Date(1700000100000).toISOString());
    expect(r.tasks[2].completedAt).toBeNull();
    expect(r.warnings).toContain('第 1 筆：缺少標題，已略過');
    expect(r.warnings.filter((w) => w.startsWith('第 2 筆'))).toHaveLength(2);
    // positions follow file order after skipping
    expect(r.tasks.map((t) => t.position)).toEqual([1024, 2048, 3072]);
  });
  it('normalises tags and subtasks, regenerating subtask ids', () => {
    const subs = Array.from({ length: 55 }, (_, i) => ({ id: String(i), title: `s${i}`, done: i === 0 }));
    const r = normalizeImportFile(
      [{ ...base, id: '1', title: 'x', tags: [' a ', 'a', ''], subtasks: [{ id: '1', title: '  ', done: true }, ...subs] }],
      TZ,
    );
    expect(r.tasks[0].tags).toEqual(['a']);
    expect(r.tasks[0].subtasks).toHaveLength(50);
    expect(r.tasks[0].subtasks[0]).toMatchObject({ title: 's0', done: true });
    expect(r.tasks[0].subtasks[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.warnings.some((w) => w.includes('子任務超過 50'))).toBe(true);
  });
});

describe('normalizeImportFile (v2)', () => {
  const fixture = {
    format: 'task-scheduler',
    version: 2,
    exportedAt: '2026-11-23T00:00:00.000Z',
    board: { name: '工作' },
    tasks: ['三', '一', '二'].map((title, i) => ({
      id: `id${i}`, title, description: '', status: 'todo', priority: 1, dueDate: '2026-12-01',
      tags: [], subtasks: [], dependsOn: i ? ['id0'] : [], createdAt: '2026-11-01T00:00:00.000Z',
      completedAt: null, position: 5000 - i,
    })),
  };
  it('round-trips titles and order', () => {
    const r = normalizeImportFile(fixture, TZ);
    expect(r.tasks.map((t) => t.title)).toEqual(['三', '一', '二']);
    expect(r.tasks[0].dueDate).toBe('2026-12-01');
    expect(r.tasks[1].dependsOnSourceIds).toEqual(['id0']);
    expect(r.warnings).toEqual([]);
  });
  it('nulls an invalid dueDate with a warning', () => {
    const r = normalizeImportFile({ ...fixture, tasks: [{ ...fixture.tasks[0], dueDate: 1700000000000 }] }, TZ);
    expect(r.tasks[0].dueDate).toBeNull();
    expect(r.warnings).toEqual(['第 1 筆：到期日無效，已清除']);
  });
});

describe('normalizeImportFile (invalid)', () => {
  it.each([{ foo: 1 }, null, 'x', 5, { format: 'task-scheduler', version: 1, tasks: [] }])(
    'throws INVALID_IMPORT_FILE for %j',
    (bad) => {
      try {
        normalizeImportFile(bad, TZ);
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError);
        expect(e).toMatchObject({ status: 400, code: 'INVALID_IMPORT_FILE' });
      }
    },
  );
});

describe('normalizeLocalStorage', () => {
  const boards = {
    boards: [
      { id: 'default', name: '我的看板', createdAt: 1 },
      { id: 'b2', name: '副業', createdAt: 2 },
    ],
    activeBoardId: 'b2',
  };
  it('groups tasks by board; missing or unknown boardId goes to default', () => {
    const r = normalizeLocalStorage(
      {
        boards,
        tasks: [
          { ...base, id: '1', title: 'a', boardId: 'b2' },
          { ...base, id: '2', title: 'b' },
          { ...base, id: '3', title: 'c', boardId: 'ghost' },
        ],
      },
      TZ,
    );
    expect(r.boards.map((b) => b.sourceId)).toEqual(['default', 'b2']);
    expect(r.tasksByBoard.b2.tasks.map((t) => t.title)).toEqual(['a']);
    expect(r.tasksByBoard.default.tasks.map((t) => t.title)).toEqual(['b', 'c']);
  });
  it('falls back to a single default board when boards are missing', () => {
    const r = normalizeLocalStorage({ boards: null, tasks: [{ ...base, id: '1', title: 'a', boardId: 'x' }] }, TZ);
    expect(r.boards).toEqual([{ sourceId: 'default', name: '我的看板' }]);
    expect(r.tasksByBoard.default.tasks).toHaveLength(1);
  });
  it('creates the default board when only unknown boards are referenced', () => {
    const r = normalizeLocalStorage(
      { boards: { boards: [{ id: 'b2', name: 'X' }] }, tasks: [{ ...base, id: '1', title: 'a' }] },
      TZ,
    );
    expect(r.boards.map((b) => b.sourceId)).toEqual(['b2', 'default']);
    expect(r.tasksByBoard.default.tasks).toHaveLength(1);
  });
  it('tolerates non-array tasks', () => {
    const r = normalizeLocalStorage({ boards: undefined, tasks: 'junk' }, TZ);
    expect(r.tasksByBoard.default.tasks).toEqual([]);
  });
});
