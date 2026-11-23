'use client';
// ⌘K command palette (spec §9 「⌘K 指令面板」): AntD Modal (no footer, 620 wide, top 120) opened by
// uiSlice.paletteOpen. Two groups share one highlighted index: 「任務」 (every board's tasks, title or
// tag contains the query, case-insensitive; empty query → the 3 most recently updated, otherwise up to
// 6; meta `<看板名> · <狀態>`) and 「動作」 (新增任務, 前往今日焦點, 切換主題, 匯出／匯入目前看板,
// 開啟到期提醒, 復原, 切換到「<看板>」看板 per board; the query filters them by label).
// ↑/↓ move the highlight, hover moves it, Enter runs it, Esc is the Modal's own. Enter on a task opens
// `/b/<boardId>?task=<id>`. No match at all → 「找不到「q」— 按 ↵ 直接建立成新任務」 and Enter creates
// the task from parseQuickAdd(q, today) on the current board (/focus: the first board) and opens it.
// 匯出／匯入目前看板 and 開啟到期提醒 call `onExportImport` (opens the DataMenu dialog; disabled on /focus, which has no current
// board) / `onReminders` (enables due-date reminders; works everywhere).
import { Modal } from 'antd';
import { usePathname, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useGetBoardsQuery, useGetTasksQuery } from '@/client/api';
import { STATUS_LABEL, useTaskCommands } from '@/client/commands';
import { useAppDispatch, useAppSelector } from '@/client/store';
import { useThemePreference } from '@/client/theme';
import { setPaletteOpen } from '@/client/uiSlice';
import { useUndo } from '@/client/undo';
import { useToday } from '@/client/useToday';
import { parseQuickAdd } from '@/lib/quickAddParser';
import { nextTheme } from '@/lib/theme';
import styles from './CommandPalette.module.scss';

export interface CommandPaletteProps {
  onExportImport: () => void;
  onReminders: () => void;
}

interface Item {
  id: string;
  group: 'task' | 'action';
  label: string;
  meta?: string;
  disabled?: boolean;
  run: () => void;
}

const RECENT = 3;
const MAX_RESULTS = 6;

export function CommandPalette(props: CommandPaletteProps) {
  const open = useAppSelector((s) => s.ui.paletteOpen);
  const dispatch = useAppDispatch();
  return (
    <Modal
      open={open}
      footer={null}
      closable={false}
      width={620}
      style={{ top: 120 }}
      destroyOnHidden
      title={null}
      aria-label="指令面板"
      onCancel={() => dispatch(setPaletteOpen(false))}
    >
      <PaletteBody {...props} />
    </Modal>
  );
}

function PaletteBody({ onExportImport, onReminders }: CommandPaletteProps) {
  const router = useRouter();
  const pathname = usePathname();
  const dispatch = useAppDispatch();
  const { data: boards = [] } = useGetBoardsQuery();
  const { data: tasks = [] } = useGetTasksQuery();
  const { pref, setPref } = useThemePreference();
  const { undo, canUndo } = useUndo();
  const cmds = useTaskCommands();
  const today = useToday();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const q = query.trim();
  const currentBoardId = /^\/b\/([^/]+)/.exec(pathname)?.[1] ?? null;
  const createBoardId = currentBoardId ?? boards[0]?.id ?? null;

  const items = useMemo(() => {
    const close = () => dispatch(setPaletteOpen(false));
    const go = (href: string) => {
      close();
      router.push(href);
    };
    const boardName = new Map(boards.map((b) => [b.id, b.name]));
    const needle = q.toLowerCase();

    const sorted = [...tasks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const matched = needle
      ? sorted
          .filter((t) => t.title.toLowerCase().includes(needle) || t.tags.some((g) => g.toLowerCase().includes(needle)))
          .slice(0, MAX_RESULTS)
      : sorted.slice(0, RECENT);
    const taskItems: Item[] = matched.map((t) => ({
      id: `task-${t.id}`,
      group: 'task',
      label: t.title,
      meta: `${boardName.get(t.boardId) ?? ''} · ${STATUS_LABEL[t.status]}`,
      run: () => go(`/b/${t.boardId}?task=${t.id}`),
    }));

    const noBoard = currentBoardId === null;
    const actions: Item[] = [
      { id: 'a-new', group: 'action', label: '新增任務', run: () => { close(); router.push('?task=new', { scroll: false }); } },
      { id: 'a-focus', group: 'action', label: '前往今日焦點', run: () => go('/focus') },
      { id: 'a-theme', group: 'action', label: '切換主題', run: () => { close(); setPref(nextTheme(pref)); } },
      { id: 'a-xfer', group: 'action', label: '匯出／匯入目前看板', disabled: noBoard, run: () => { close(); onExportImport(); } },
      { id: 'a-remind', group: 'action', label: '開啟到期提醒', run: () => { close(); onReminders(); } },
      { id: 'a-undo', group: 'action', label: '復原', disabled: !canUndo, run: () => { close(); void undo(); } },
      ...boards.map<Item>((b) => ({
        id: `a-board-${b.id}`,
        group: 'action',
        label: `切換到「${b.name}」看板`,
        run: () => go(`/b/${b.id}`),
      })),
    ];
    const actionItems = needle ? actions.filter((a) => a.label.toLowerCase().includes(needle)) : actions;
    return [...taskItems, ...actionItems];
  }, [tasks, boards, q, currentBoardId, pref, canUndo, undo, setPref, router, dispatch, onExportImport, onReminders]);

  const highlighted = Math.min(active, Math.max(items.length - 1, 0));

  async function createFromQuery() {
    if (!q || !createBoardId) return;
    const parsed = parseQuickAdd(q, today);
    if (!parsed.title) return;
    const task = await cmds.create({
      boardId: createBoardId,
      title: parsed.title,
      ...(parsed.priority !== null && { priority: parsed.priority }),
      tags: parsed.tags,
      dueDate: parsed.dueDate,
    });
    if (!task) return;
    dispatch(setPaletteOpen(false));
    router.push(`/b/${task.boardId}?task=${task.id}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (items.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((highlighted + step + items.length) % items.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (items.length === 0) void createFromQuery();
      else if (!items[highlighted].disabled) items[highlighted].run();
    }
  }

  const groups = [
    { title: '任務', items: items.filter((i) => i.group === 'task') },
    { title: '動作', items: items.filter((i) => i.group === 'action') },
  ];

  return (
    <div className={styles.palette}>
      <input
        autoFocus
        className={styles.input}
        placeholder="搜尋任務、看板，或輸入指令…"
        aria-label="搜尋任務、看板，或輸入指令…"
        role="combobox"
        aria-expanded="true"
        aria-controls="palette-list"
        aria-activedescendant={items.length > 0 ? `palette-${items[highlighted].id}` : undefined}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
      />
      <div className={styles.list} id="palette-list" role="listbox" aria-label="結果">
        {items.length === 0 && q && <p className={styles.empty}>{`找不到「${q}」— 按 ↵ 直接建立成新任務`}</p>}
        {groups.map(
          (g) =>
            g.items.length > 0 && (
              <div key={g.title} role="group" aria-label={g.title}>
                <div className={styles.groupTitle} aria-hidden="true">
                  {g.title}
                </div>
                {g.items.map((item) => {
                  const index = items.indexOf(item);
                  return (
                    <div
                      key={item.id}
                      id={`palette-${item.id}`}
                      role="option"
                      aria-selected={index === highlighted}
                      aria-disabled={item.disabled || undefined}
                      className={`${styles.option} ${index === highlighted ? styles.active : ''} ${item.disabled ? styles.disabled : ''}`}
                      onMouseMove={() => setActive(index)}
                      onClick={() => !item.disabled && item.run()}
                    >
                      <span className={styles.label}>{item.label}</span>
                      {item.meta && <span className={styles.meta}>{item.meta}</span>}
                    </div>
                  );
                })}
              </div>
            ),
        )}
      </div>
    </div>
  );
}
