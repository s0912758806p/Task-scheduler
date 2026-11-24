'use client';
// One-time migration banner (spec §8). Shown at the top of every signed-in page (AppShell mounts it
// once) when this browser's localStorage still holds the old app's `taskSchedulerTasks_v3` and/or
// `taskSchedulerBoards` and `taskSchedulerMigrated` is not set. Corrupt JSON counts as no data.
// The old app stored taskSchedulerBoards as `{ boards: [...], activeBoardId }`; the banner counts
// `boards.boards` (a bare array is tolerated too), and tasks without any boards list count as the
// old implicit default board.
// - 匯入: POST /api/import/local with the parsed old values and the browser time zone, then writes
//   `taskSchedulerMigrated=1` and toasts 「已匯入 N 筆舊任務」. A failure keeps the banner (the API
//   layer already toasted the reason).
// - 略過: writes `taskSchedulerMigrated=1`.
// The old keys are never deleted. All localStorage access is try/catch'd and happens after mount.
import { useMemo, useState, useSyncExternalStore } from 'react';
import { useImportLocalMutation } from '@/client/api';
import { useUndo } from '@/client/undo';
import styles from './LegacyImportBanner.module.scss';

const BOARDS_KEY = 'taskSchedulerBoards';
const TASKS_KEY = 'taskSchedulerTasks_v3';
const MIGRATED_KEY = 'taskSchedulerMigrated';

interface Legacy {
  boards: unknown;
  tasks: unknown;
  boardCount: number;
  taskCount: number;
}

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

/** The three raw values as one string, so useSyncExternalStore gets a stable snapshot. null = unreadable. */
function snapshot(): string | null {
  try {
    return JSON.stringify([
      localStorage.getItem(BOARDS_KEY),
      localStorage.getItem(TASKS_KEY),
      localStorage.getItem(MIGRATED_KEY),
    ]);
  } catch {
    return null;
  }
}
const subscribeNever = () => () => {};
const serverSnapshot = () => null;

/** The old app's board list: `{ boards: [...], activeBoardId }` as it persisted it, or a bare array. */
function legacyBoardList(raw: unknown): unknown[] | null {
  if (Array.isArray(raw)) return raw;
  const inner = typeof raw === 'object' && raw !== null ? (raw as { boards?: unknown }).boards : undefined;
  return Array.isArray(inner) ? inner : null;
}

function readLegacy(): Legacy | null {
  try {
    if (localStorage.getItem(MIGRATED_KEY) !== null) return null;
  } catch {
    return null;
  }
  const boards = readJson(BOARDS_KEY);
  const tasks = readJson(TASKS_KEY);
  const taskCount = Array.isArray(tasks) ? tasks.length : 0;
  // Tasks without a boards list live in the old app's implicit default board.
  const list = legacyBoardList(boards);
  const boardCount = list ? list.length : taskCount > 0 ? 1 : 0;
  if (boardCount === 0 && taskCount === 0) return null;
  return { boards, tasks, boardCount, taskCount };
}

function markMigrated() {
  try {
    localStorage.setItem(MIGRATED_KEY, '1');
  } catch {
    // storage unavailable: the banner returns on the next load
  }
}

export function LegacyImportBanner() {
  const stored = useSyncExternalStore(subscribeNever, snapshot, serverSnapshot);
  const [done, setDone] = useState(false);
  const found = useMemo(() => (stored === null ? null : readLegacy()), [stored]);
  const legacy = done ? null : found;
  const [importLocal, { isLoading }] = useImportLocalMutation();
  const { showToast } = useUndo();

  if (!legacy) return null;

  async function runImport() {
    if (!legacy) return;
    try {
      const result = await importLocal({
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        boards: legacy.boards,
        tasks: legacy.tasks,
      }).unwrap();
      markMigrated();
      setDone(true);
      showToast(`已匯入 ${result.taskCount} 筆舊任務`);
    } catch {
      // already toasted by the API layer; keep the banner so the user can retry or skip
    }
  }

  function skip() {
    markMigrated();
    setDone(true);
  }

  return (
    <div className={styles.banner} role="region" aria-label="舊資料搬家">
      <span className={styles.text}>
        {`發現這台裝置上的舊資料（${legacy.boardCount} 個看板、${legacy.taskCount} 筆任務）`}
      </span>
      <span className={styles.actions}>
        <button type="button" className={styles.primary} disabled={isLoading} onClick={() => void runImport()}>
          匯入
        </button>
        <button type="button" className={styles.secondary} disabled={isLoading} onClick={skip}>
          略過
        </button>
      </span>
    </div>
  );
}
