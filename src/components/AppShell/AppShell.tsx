'use client';
// Signed-in page frame (spec §9): Sidebar (232px) + <main> + the task detail panel (TaskDetailDock:
// right column for `?task=<id|new>`, a bottom Drawer on phones) + the bottom UndoToast. Below 768px
// the sidebar becomes an AntD Drawer opened from the top bar's hamburger (uiSlice.sidebarOpen) and
// closed on navigation. Also starts loading boards and tasks for every page.
import { Drawer } from 'antd';
import { usePathname } from 'next/navigation';
import { Suspense, useEffect, type ReactNode } from 'react';
import { useAppDispatch, useAppSelector } from '@/client/store';
import { setSidebarOpen } from '@/client/uiSlice';
import { IconMenu } from '@/components/icons';
import { Sidebar } from '@/components/Sidebar/Sidebar';
import type { SidebarUser } from '@/components/Sidebar/UserMenu';
import { TaskDetailDock } from '@/components/TaskDetailPanel/TaskDetailDock';
import { UndoToast } from '@/components/UndoToast/UndoToast';
import styles from './AppShell.module.scss';

export function AppShell({ user, children }: { user: SidebarUser; children: ReactNode }) {
  const dispatch = useAppDispatch();
  const open = useAppSelector((s) => s.ui.sidebarOpen);
  const pathname = usePathname();

  useEffect(() => {
    dispatch(setSidebarOpen(false));
  }, [pathname, dispatch]);

  return (
    <div className={styles.shell}>
      <aside className={styles.desktopSidebar}>
        <Sidebar user={user} />
      </aside>
      <Drawer
        open={open}
        placement="left"
        size={232}
        closable={false}
        onClose={() => dispatch(setSidebarOpen(false))}
        styles={{ body: { padding: 0 } }}
      >
        <Sidebar user={user} />
      </Drawer>
      <div className={styles.column}>
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
        <main className={styles.main}>{children}</main>
      </div>
      {/* useSearchParams: keep it out of the static shell. */}
      <Suspense fallback={null}>
        <TaskDetailDock />
      </Suspense>
      <UndoToast />
    </div>
  );
}
