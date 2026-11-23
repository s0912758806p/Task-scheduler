'use client';
// One board row in the sidebar: link to /b/<id> with its open-task count. Double-click the name to
// rename inline (Enter / blur saves a changed, non-empty name; Esc cancels, with preventDefault so it
// does not also close the detail panel). Right-click the row or press ⋯ for the menu: 重新命名 /
// 刪除看板 (the delete confirmation lives in Sidebar).
import { Dropdown, type MenuProps } from 'antd';
import Link from 'next/link';
import { useState, type KeyboardEvent } from 'react';
import { useUpdateBoardMutation } from '@/client/api';
import { IconBoard, IconMore } from '@/components/icons';
import { BOARD_NAME_MAX } from '@/lib/validation';
import type { Board } from '@/lib/types';
import styles from './Sidebar.module.scss';

const MENU: MenuProps['items'] = [
  { key: 'rename', label: '重新命名' },
  { key: 'delete', label: '刪除看板', danger: true },
];

export function BoardItem({
  board,
  count,
  active,
  onNavigate,
  onDelete,
}: {
  board: Board;
  count: number;
  active: boolean;
  onNavigate: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [updateBoard] = useUpdateBoardMutation();

  const onMenu: MenuProps['onClick'] = ({ key }) => {
    if (key === 'rename') setEditing(true);
    if (key === 'delete') onDelete();
  };

  function commit(value: string) {
    setEditing(false);
    const name = value.trim();
    if (name && name !== board.name) void updateBoard({ id: board.id, name });
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') commit(e.currentTarget.value);
    if (e.key === 'Escape') {
      e.preventDefault(); // cancels the rename only, not the detail panel
      setEditing(false);
    }
  }

  return (
    <li>
      <Dropdown menu={{ items: MENU, onClick: onMenu }} trigger={['contextMenu']}>
        <div className={styles.boardRow}>
          {editing ? (
            <input
              className={styles.renameInput}
              aria-label="看板名稱"
              defaultValue={board.name}
              maxLength={BOARD_NAME_MAX}
              autoFocus
              onKeyDown={onKeyDown}
              onBlur={(e) => commit(e.currentTarget.value)}
            />
          ) : (
            <Link
              href={`/b/${board.id}`}
              className={styles.item}
              aria-current={active ? 'page' : undefined}
              onClick={onNavigate}
              onDoubleClick={(e) => {
                e.preventDefault();
                setEditing(true);
              }}
            >
              <IconBoard />
              <span className={styles.grow}>{board.name}</span>
              {count > 0 && <span className={styles.count}>{count}</span>}
            </Link>
          )}
          <Dropdown menu={{ items: MENU, onClick: onMenu }} trigger={['click']}>
            <button type="button" className={styles.more} aria-label={`「${board.name}」的選項`}>
              <IconMore />
            </button>
          </Dropdown>
        </div>
      </Dropdown>
    </li>
  );
}
