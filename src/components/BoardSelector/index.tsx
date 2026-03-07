import React, { useState } from "react";
import { Tabs, Input, Modal, Button, Tooltip } from "antd";
import { PlusOutlined, ExclamationCircleOutlined } from "@ant-design/icons";
import { useAppSelector, useAppDispatch } from "../../hooks/redux";
import {
  setActiveBoard,
  createBoard,
  renameBoard,
  deleteBoard,
} from "../../store/boardSlice";
import { deleteTasksByBoard } from "../../store/taskSlice";
import "./board-selector.scss";

const { confirm } = Modal;

const BoardSelector: React.FC = () => {
  const dispatch = useAppDispatch();
  const { boards, activeBoardId } = useAppSelector((state) => state.board);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");

  const handleRenameConfirm = (id: string) => {
    if (renameValue.trim()) {
      dispatch(renameBoard({ id, name: renameValue }));
    }
    setRenamingId(null);
  };

  const handleDeleteBoard = (id: string) => {
    const boardName = boards.find((b) => b.id === id)?.name ?? "此看板";
    confirm({
      title: `確定要刪除「${boardName}」嗎？`,
      icon: <ExclamationCircleOutlined />,
      content: "看板內所有任務將一併刪除，此操作不可撤銷。",
      okText: "刪除",
      okType: "danger",
      cancelText: "取消",
      onOk() {
        dispatch(deleteTasksByBoard(id));
        dispatch(deleteBoard(id));
      },
    });
  };

  const handleAddBoard = () => {
    if (newBoardName.trim()) {
      dispatch(createBoard(newBoardName.trim()));
    }
    setIsAddModalOpen(false);
    setNewBoardName("");
  };

  const tabItems = boards.map((board) => ({
    key: board.id,
    label:
      renamingId === board.id ? (
        <Input
          value={renameValue}
          size="small"
          style={{ width: 100 }}
          autoFocus
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={() => handleRenameConfirm(board.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleRenameConfirm(board.id);
            if (e.key === "Escape") setRenamingId(null);
            e.stopPropagation();
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <Tooltip title="雙擊改名" mouseEnterDelay={1}>
          <span
            onDoubleClick={(e) => {
              e.stopPropagation();
              setRenamingId(board.id);
              setRenameValue(board.name);
            }}
          >
            {board.name}
          </span>
        </Tooltip>
      ),
    closable: boards.length > 1,
  }));

  return (
    <div className="board-selector">
      <Tabs
        type="editable-card"
        activeKey={activeBoardId}
        onChange={(key) => dispatch(setActiveBoard(key))}
        onEdit={(targetKey, action) => {
          if (action === "remove") handleDeleteBoard(targetKey as string);
          if (action === "add") setIsAddModalOpen(true);
        }}
        items={tabItems}
        addIcon={
          <Tooltip title="新增看板">
            <PlusOutlined />
          </Tooltip>
        }
      />

      <Modal
        title="新增看板"
        open={isAddModalOpen}
        onCancel={() => { setIsAddModalOpen(false); setNewBoardName(""); }}
        footer={
          <Button type="primary" onClick={handleAddBoard} disabled={!newBoardName.trim()}>
            建立
          </Button>
        }
      >
        <Input
          placeholder="請輸入看板名稱"
          value={newBoardName}
          onChange={(e) => setNewBoardName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAddBoard(); }}
          autoFocus
        />
      </Modal>
    </div>
  );
};

export default BoardSelector;
