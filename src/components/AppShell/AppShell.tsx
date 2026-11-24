'use client';
// Signed-in page frame (spec §9): Sidebar (232px) + <main> + the task detail panel (TaskDetailDock:
// right column for `?task=<id|new>`, a bottom Drawer on phones) + the bottom UndoToast. Below 768px
// the sidebar becomes an AntD Drawer opened from the top bar's hamburger (uiSlice.sidebarOpen) and
// closed on navigation. The generic mobile bar (hamburger only) is for non-board pages; /b/* pages
// render their own 「☰ 看板名稱▾ 🔍」 bar in TopBar. Mounts the ⌘K CommandPalette, the 快捷鍵 dialog, the 匯入／匯出 DataMenu, the legacy-data
// banner (above <main>, so /focus and board pages show it once) and useShortcuts (the one
// global keydown listener). useNotifications runs once here; its result goes to both Sidebars and the palette.
// Also starts loading boards and tasks for every page.
import { Drawer } from 'antd';
import { usePathname } from 'next/navigation';
import { Suspense, useEffect, type ReactNode } from 'react';
import { useAppDispatch, useAppSelector } from '@/client/store';
import { setDataMenuOpen, setShortcutsOpen, setSidebarOpen } from '@/client/uiSlice';
import { useUndo } from '@/client/undo';
import { useNotifications } from '@/client/useNotifications';
import { useShortcuts } from '@/client/useShortcuts';
import { CommandPalette } from '@/components/CommandPalette/CommandPalette';
import { DataMenu } from '@/components/DataMenu/DataMenu';
import { IconMenu } from '@/components/icons';
import { LegacyImportBanner } from '@/components/LegacyImportBanner/LegacyImportBanner';
import { ShortcutsDialog } from '@/components/Sidebar/ShortcutsDialog';
import { Sidebar } from '@/components/Sidebar/Sidebar';
import type { SidebarUser } from '@/components/Sidebar/UserMenu';
import { TaskDetailDock } from '@/components/TaskDetailPanel/TaskDetailDock';
import { UndoToast } from '@/components/UndoToast/UndoToast';
import styles from './AppShell.module.scss';

export function AppShell({ user, children }: { user: SidebarUser; children: ReactNode }) {
  const dispatch = useAppDispatch();
  const open = useAppSelector((s) => s.ui.sidebarOpen);
  const shortcutsOpen = useAppSelector((s) => s.ui.shortcutsOpen);
  const pathname = usePathname();
  useShortcuts();
  const reminders = useNotifications();
  const { showToast } = useUndo();

  function enableReminders() {
    if (reminders.permission === 'unsupported') showToast('此瀏覽器不支援通知');
    else if (reminders.permission === 'denied') showToast('通知已被瀏覽器封鎖，請在網站設定中允許');
    else if (reminders.permission === 'default') void reminders.enable();
  }

  useEffect(() => {
    dispatch(setSidebarOpen(false));
  }, [pathname, dispatch]);

  return (
    <div className={styles.shell}>
      <aside className={styles.desktopSidebar}>
        <Sidebar user={user} reminders={reminders} />
      </aside>
      <Drawer
        open={open}
        placement="left"
        size={232}
        closable={false}
        onClose={() => dispatch(setSidebarOpen(false))}
        styles={{ body: { padding: 0 } }}
      >
        <Sidebar user={user} reminders={reminders} />
      </Drawer>
      <div className={styles.column}>
        {!pathname?.startsWith('/b/') && (
          <header className={styles.mobileBar}>
            <button
              type="button"
              className={styles.hamburger}
              aria-label="開啟側欄"
              onClick={() => dispatch(setSidebarOpen(true))}
            >
              <IconMenu size={20} />
            </button>
          </header>
        )}
        <LegacyImportBanner />
        <main className={styles.main}>{children}</main>
      </div>
      {/* useSearchParams: keep it out of the static shell. */}
      <Suspense fallback={null}>
        <TaskDetailDock />
      </Suspense>
      <UndoToast />
      <CommandPalette onExportImport={() => dispatch(setDataMenuOpen(true))} onReminders={enableReminders} />
      <DataMenu />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => dispatch(setShortcutsOpen(false))} />
    </div>
  );
}
