'use client';
// Where the detail panel lives (spec §6.3 「詳情欄 = ?task=<id>」, §9 版面 / 手機). Mounted by AppShell
// next to the main content; renders nothing without `?task=`.
// - Desktop: a non-modal right column (~360px) — the board stays visible and usable.
// - Phone (< 768px, useMediaQuery): an AntD Drawer from the bottom, 85% high.
// - Target board for `?task=new`: the board in the path (/b/[boardId]); elsewhere (e.g. /focus) the
//   first board from getBoards.
// - Closing removes `task` from the query string with router.replace (other params kept). The panel
//   is keyed by the id, so switching tasks starts from fresh drafts (a pending edit is flushed).
import { Drawer } from 'antd';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useGetBoardsQuery } from '@/client/api';
import { MOBILE_QUERY, useMediaQuery } from '@/client/useMediaQuery';
import { TaskDetailPanel } from './TaskDetailPanel';
import styles from './TaskDetailPanel.module.scss';

/** The board id in a /b/[boardId] path, else null. */
export function boardIdFromPath(pathname: string): string | null {
  const m = /^\/b\/([^/]+)/.exec(pathname);
  return m ? decodeURIComponent(m[1]) : null;
}

export function TaskDetailDock() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const mobile = useMediaQuery(MOBILE_QUERY);
  const { data: boards } = useGetBoardsQuery();
  const taskId = params.get('task');
  if (!taskId) return null;

  const boardId = boardIdFromPath(pathname) ?? boards?.[0]?.id ?? null;
  const close = () => {
    const rest = new URLSearchParams(params);
    rest.delete('task');
    const query = rest.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
  const panel = <TaskDetailPanel key={taskId} taskId={taskId} boardId={boardId} onClose={close} />;

  if (mobile) {
    return (
      <Drawer
        open
        placement="bottom"
        size="85%"
        closable={false}
        keyboard={false}
        onClose={close}
        styles={{ body: { padding: 0 } }}
      >
        {panel}
      </Drawer>
    );
  }
  return <div className={styles.dock}>{panel}</div>;
}
