'use client';
// Left sidebar (spec §9 layout, 232px): logo, ⌘K search button (opens the command palette via
// uiSlice), 今日焦點 with a badge = overdue + due-today open tasks across all boards
// (taskQueries.focusGroups, today from useToday so it rolls over at midnight), the board list with open-task counts (from the task cache; the
// server's openCount until tasks load), 新增看板, and the footer: theme toggle (淺色 → 深色 →
// 跟隨系統), 匯入／匯出 and 到期提醒 (wired in Task 17), 快捷鍵 help, and the user menu (登出).
// 快捷鍵 dispatches setShortcutsOpen(true); the dialog itself is mounted once by AppShell.
// The current page comes from usePathname(); following a link closes the mobile drawer.
// Deleting the board being viewed sends you to /focus.
import { Modal } from 'antd';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useDeleteBoardMutation, useGetBoardsQuery, useGetTasksQuery } from '@/client/api';
import { useAppDispatch } from '@/client/store';
import { useThemePreference } from '@/client/theme';
import { useToday } from '@/client/useToday';
import { setPaletteOpen, setShortcutsOpen, setSidebarOpen } from '@/client/uiSlice';
import {
  IconBell,
  IconFocus,
  IconKeyboard,
  IconLogo,
  IconMonitor,
  IconMoon,
  IconPlus,
  IconSearch,
  IconSun,
  IconTransfer,
} from '@/components/icons';
import { focusGroups, indexById } from '@/lib/taskQueries';
import { nextTheme, THEME_LABEL } from '@/lib/theme';
import type { Board } from '@/lib/types';
import { BoardItem } from './BoardItem';
import { NewBoardModal } from './NewBoardModal';
import styles from './Sidebar.module.scss';
import { UserMenu, type SidebarUser } from './UserMenu';

const THEME_ICON = { light: IconSun, dark: IconMoon, system: IconMonitor };

export function Sidebar({ user }: { user: SidebarUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { pref, setPref } = useThemePreference();
  const { data: boards = [] } = useGetBoardsQuery();
  const { data: tasks } = useGetTasksQuery();
  const [deleteBoard] = useDeleteBoardMutation();
  const [modal, modalHolder] = Modal.useModal();
  const today = useToday();
  const [creating, setCreating] = useState(false);

  const { openByBoard, focusCount } = useMemo(() => {
    if (!tasks) return { openByBoard: null, focusCount: 0 };
    const open = new Map<string, number>();
    for (const t of tasks) if (t.status !== 'done') open.set(t.boardId, (open.get(t.boardId) ?? 0) + 1);
    const groups = focusGroups(tasks, indexById(tasks), today);
    return { openByBoard: open, focusCount: groups.overdue.length + groups.today.length };
  }, [tasks, today]);

  const closeDrawer = () => dispatch(setSidebarOpen(false));

  function confirmDelete(board: Board) {
    void modal.confirm({
      title: '刪除看板',
      content: `確定要刪除「${board.name}」嗎？看板內所有任務將一併刪除，此操作無法復原。`,
      okText: '刪除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        const ok = await deleteBoard(board.id)
          .unwrap()
          .then(
            () => true,
            () => false, // the API layer already showed the error (e.g. 至少要保留一個看板)
          );
        if (ok && pathname === `/b/${board.id}`) router.push('/focus');
      },
    });
  }

  const ThemeIcon = THEME_ICON[pref];

  return (
    <nav className={styles.sidebar} aria-label="側欄">
      <div className={styles.brand}>
        <IconLogo size={20} />
        <span>任務排程器</span>
      </div>

      <button type="button" className={`${styles.item} ${styles.search}`} onClick={() => dispatch(setPaletteOpen(true))}>
        <IconSearch />
        <span className={styles.grow}>搜尋或執行指令</span>
        <kbd className={styles.kbd}>⌘K</kbd>
      </button>

      <Link
        href="/focus"
        className={styles.item}
        aria-current={pathname === '/focus' ? 'page' : undefined}
        onClick={closeDrawer}
      >
        <IconFocus />
        <span className={styles.grow}>今日焦點</span>
        {focusCount > 0 && <span className={styles.badge}>{focusCount}</span>}
      </Link>

      <div className={styles.sectionTitle}>看板</div>
      <ul className={styles.boards}>
        {boards.map((board) => (
          <BoardItem
            key={board.id}
            board={board}
            count={openByBoard ? (openByBoard.get(board.id) ?? 0) : board.openCount}
            active={pathname === `/b/${board.id}`}
            onNavigate={closeDrawer}
            onDelete={() => confirmDelete(board)}
          />
        ))}
      </ul>
      <button type="button" className={styles.item} onClick={() => setCreating(true)}>
        <IconPlus />
        <span className={styles.grow}>新增看板</span>
      </button>

      <div className={styles.footer}>
        <button
          type="button"
          className={styles.item}
          aria-label={`主題：${THEME_LABEL[pref]}`}
          title="切換主題"
          onClick={() => setPref(nextTheme(pref))}
        >
          <ThemeIcon />
          <span className={styles.grow}>{THEME_LABEL[pref]}</span>
        </button>
        <button type="button" className={styles.item}>
          <IconTransfer />
          <span className={styles.grow}>匯入／匯出</span>
        </button>
        <button type="button" className={styles.item}>
          <IconBell />
          <span className={styles.grow}>到期提醒</span>
        </button>
        <button type="button" className={styles.item} onClick={() => dispatch(setShortcutsOpen(true))}>
          <IconKeyboard />
          <span className={styles.grow}>快捷鍵</span>
          <kbd className={styles.kbd}>?</kbd>
        </button>
        <UserMenu user={user} />
      </div>

      <NewBoardModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(board) => {
          setCreating(false);
          closeDrawer();
          router.push(`/b/${board.id}`);
        }}
      />
      {modalHolder}
    </nav>
  );
}
