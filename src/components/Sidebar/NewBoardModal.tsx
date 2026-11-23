'use client';
// 新增看板 dialog: name input (1–60 chars after trimming); 建立 / Enter creates the board and calls
// onCreated with it (the Enter that confirms an IME composition is ignored: isImeEnter). Errors are
// toasted by the API layer and leave the dialog open.
import { Input, Modal } from 'antd';
import { useState } from 'react';
import { useCreateBoardMutation } from '@/client/api';
import { isImeEnter } from '@/lib/ime';
import { BOARD_NAME_MAX } from '@/lib/validation';
import type { Board } from '@/lib/types';

export function NewBoardModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (board: Board) => void;
}) {
  const [name, setName] = useState('');
  const [createBoard, { isLoading }] = useCreateBoardMutation();
  const trimmed = name.trim();

  async function submit() {
    if (!trimmed || isLoading) return;
    try {
      const board = await createBoard({ name: trimmed }).unwrap();
      setName('');
      onCreated(board);
    } catch {
      // already toasted
    }
  }

  return (
    <Modal
      open={open}
      title="新增看板"
      okText="建立"
      cancelText="取消"
      okButtonProps={{ disabled: !trimmed }}
      confirmLoading={isLoading}
      onOk={() => void submit()}
      onCancel={() => {
        setName('');
        onClose();
      }}
      destroyOnHidden
    >
      <Input
        aria-label="看板名稱"
        placeholder="看板名稱"
        value={name}
        maxLength={BOARD_NAME_MAX}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !isImeEnter(e)) void submit();
        }}
      />
    </Modal>
  );
}
