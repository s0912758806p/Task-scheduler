'use client';
// 匯入／匯出 dialog (spec §7), mounted once by AppShell and opened through uiSlice.dataMenuOpen by
// the Sidebar button and the command palette action (one implementation). Works on the board in the
// URL (/b/<id>); on /focus there is no current board and both buttons are disabled.
// - 匯出: GET /api/boards/:id/export → blob → object URL → <a download>, named by the server's
//   Content-Disposition (RFC 5987 filename* preferred, then filename), else board-YYYY-MM-DD.json.
//   The object URL is revoked in a later task (setTimeout 0), after the download has started. A
//   failed request toasts the server's message.
// - 匯入: pick a .json file → confirm 「匯入會取代「<看板>」目前的任務（其他看板不受影響）。可用 ⌘Z 復原。」
//   → POST /api/boards/:id/import with the browser time zone. One undo command: undo = batch restore
//   `replaced` then batch delete `imported`; redo = batch delete `replaced` then batch restore
//   `imported` (the file is gone, so the request is never replayed). Toast 「已匯入 N 筆任務」 with
//   復原; warnings open a Modal.info list. Errors (400/413/…) are toasted by the API layer; a file
//   that is not JSON toasts 「這不是有效的 JSON 檔案」.
import { Modal } from 'antd';
import { usePathname } from 'next/navigation';
import { useRef } from 'react';
import { errorMessage, useBatchTasksMutation, useGetBoardsQuery, useImportBoardMutation } from '@/client/api';
import { useAppDispatch, useAppSelector } from '@/client/store';
import { setDataMenuOpen } from '@/client/uiSlice';
import { useUndo } from '@/client/undo';
import { todayISO } from '@/lib/dates';
import styles from './DataMenu.module.scss';

/** File name from a Content-Disposition header: filename*=UTF-8''… first, then filename="…". */
export function downloadName(header: string | null): string | null {
  if (!header) return null;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header)?.[1];
  if (star) {
    try {
      return decodeURIComponent(star.trim());
    } catch {
      // fall through to the plain filename
    }
  }
  return /filename="([^"]+)"/i.exec(header)?.[1] ?? null;
}

export function DataMenu() {
  const open = useAppSelector((s) => s.ui.dataMenuOpen);
  const dispatch = useAppDispatch();
  const pathname = usePathname();
  const { data: boards = [] } = useGetBoardsQuery();
  const [importBoard] = useImportBoardMutation();
  const [batchTasks] = useBatchTasksMutation();
  const { push, showToast } = useUndo();
  const [modal, modalHolder] = Modal.useModal();
  const fileInput = useRef<HTMLInputElement>(null);

  const boardId = /^\/b\/([^/]+)/.exec(pathname ?? '')?.[1] ?? null;
  const board = boards.find((b) => b.id === boardId) ?? null;
  const close = () => dispatch(setDataMenuOpen(false));

  async function exportCurrent() {
    if (!board) return;
    close();
    try {
      const res = await fetch(`/api/boards/${board.id}/export`);
      if (res.status === 401) {
        // A full page load on purpose, as in the API layer's 401 handling.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign('/login?next=' + encodeURIComponent(window.location.pathname + window.location.search));
        return;
      }
      if (!res.ok) {
        showToast(errorMessage({ status: res.status, data: await res.json().catch(() => undefined) }));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = downloadName(res.headers.get('Content-Disposition')) ?? `board-${todayISO()}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Not synchronously: some browsers start the download after click() returns.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      showToast('無法連線到伺服器，請檢查網路後再試');
    }
  }

  function pickFile() {
    fileInput.current?.click(); // inside the click handler: browsers require the user gesture
    close();
  }

  async function runImport(target: { id: string; name: string }, file: unknown) {
    let result;
    try {
      result = await importBoard({
        boardId: target.id,
        file,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }).unwrap();
    } catch {
      return; // already toasted by the API layer
    }
    const { imported, replaced, warnings } = result;
    const batch = async (ids: string[], op: 'delete' | 'restore') => {
      if (ids.length > 0) await batchTasks({ ids, op }).unwrap();
    };
    push({
      label: `匯入「${target.name}」`,
      undo: async () => {
        await batch(replaced, 'restore');
        await batch(imported, 'delete');
      },
      redo: async () => {
        await batch(replaced, 'delete');
        await batch(imported, 'restore');
      },
    });
    showToast(`已匯入 ${imported.length} 筆任務`, true);
    if (warnings.length > 0) {
      modal.info({
        title: '匯入時有些資料已自動調整',
        content: (
          <ul className={styles.warnings}>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        ),
        okText: '知道了',
      });
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    input.value = ''; // picking the same file again must fire change again
    if (!file || !board) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      showToast('這不是有效的 JSON 檔案');
      return;
    }
    const target = { id: board.id, name: board.name };
    modal.confirm({
      title: '匯入看板',
      content: `匯入會取代「${target.name}」目前的任務（其他看板不受影響）。可用 ⌘Z 復原。`,
      okText: '匯入',
      cancelText: '取消',
      onOk: () => runImport(target, parsed),
    });
  }

  return (
    <>
      <Modal open={open} title="匯入／匯出" footer={null} onCancel={close}>
        <p className={styles.note}>{board ? `目前看板：「${board.name}」` : '請先開啟一個看板，再匯入或匯出。'}</p>
        <div className={styles.actions}>
          <button type="button" className={styles.action} disabled={!board} onClick={() => void exportCurrent()}>
            匯出目前看板
          </button>
          <button type="button" className={styles.action} disabled={!board} onClick={pickFile}>
            匯入檔案…
          </button>
        </div>
      </Modal>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        aria-label="選擇要匯入的 JSON 檔案"
        onChange={(e) => void onFile(e)}
      />
      {modalHolder}
    </>
  );
}
