'use client';
// 快捷鍵 help dialog: the keyboard shortcuts of spec §9 (single-key shortcuts never fire inside
// text fields).
import { Modal } from 'antd';
import styles from './Sidebar.module.scss';

const SHORTCUTS: [string, string][] = [
  ['⌘K / Ctrl+K', '開啟指令面板'],
  ['N', '新增任務'],
  ['/', '聚焦搜尋'],
  ['Esc', '關閉詳情欄或面板'],
  ['1–9', '切換看板'],
  ['G 然後 F', '前往今日焦點'],
  ['⌘Z', '復原'],
  ['⌘⇧Z / Ctrl+Y', '重做'],
  ['?', '快捷鍵說明'],
];

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} title="快捷鍵" footer={null} onCancel={onClose}>
      <dl className={styles.shortcuts}>
        {SHORTCUTS.map(([keys, what]) => (
          <div key={keys} className={styles.shortcutRow}>
            <dt>
              <kbd className={styles.kbd}>{keys}</kbd>
            </dt>
            <dd>{what}</dd>
          </div>
        ))}
      </dl>
      <p className={styles.shortcutNote}>在輸入框中不會觸發單鍵快捷鍵。</p>
    </Modal>
  );
}
