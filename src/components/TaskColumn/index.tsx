import React, { useState } from "react";
import { Card, Typography, Badge, Input } from "antd";
import { Droppable } from "@hello-pangea/dnd";
import { TaskData, TaskStatus } from "../../types/task";
import { useAppDispatch, useAppSelector } from "../../hooks/redux";
import { addTask } from "../../store/taskSlice";
import Task from "../Task";
import "./task-column.scss";

const { Title } = Typography;

interface TaskColumnProps {
  title: string;
  status: TaskStatus;
  tasks: TaskData[];
  batchMode?: boolean;
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
}

const getStatusTitle = (status: TaskStatus): string => {
  switch (status) {
    case "todo":
      return "待處理";
    case "in-progress":
      return "進行中";
    case "done":
      return "已完成";
    default:
      return "未知";
  }
};

const getStatusColor = (status: TaskStatus): string => {
  switch (status) {
    case "todo":        return "#94a3b8";
    case "in-progress": return "#2563eb";
    case "done":        return "#16a34a";
    default:            return "#94a3b8";
  }
};

const TaskColumn: React.FC<TaskColumnProps> = ({
  title, status, tasks,
  batchMode = false, selectedIds = [], onToggleSelect,
}) => {
  const dispatch = useAppDispatch();
  const { activeBoardId } = useAppSelector((state) => state.board);
  const [quickAddTitle, setQuickAddTitle] = useState("");

  const filteredTasks = tasks.filter((task) => task.status === status);

  const handleQuickAdd = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && quickAddTitle.trim()) {
      dispatch(addTask({ title: quickAddTitle.trim(), status, priority: 2, boardId: activeBoardId }));
      setQuickAddTitle("");
    }
  };

  return (
    <div className={`task-column column-status-${status}`}>
      <div className="column-header">
        <div className="column-title-group">
          <Badge color={getStatusColor(status)} />
          <Title level={5}>{title || getStatusTitle(status)}</Title>
          <span className="task-count">{filteredTasks.length}</span>
        </div>
      </div>

      <Droppable droppableId={status}>
        {(provided, snapshot) => (
          <div
            className={`task-list ${
              snapshot.isDraggingOver ? "dragging-over" : ""
            }`}
            ref={provided.innerRef}
            {...provided.droppableProps}
          >
            {filteredTasks.length === 0 ? (
              <Card className="empty-card">沒有任務</Card>
            ) : (
              filteredTasks.map((task, index) => (
                <Task
                  key={task.id}
                  index={index}
                  {...task}
                  batchMode={batchMode}
                  isSelected={selectedIds.includes(task.id)}
                  onToggleSelect={onToggleSelect}
                />
              ))
            )}
            {provided.placeholder}
          </div>
        )}
      </Droppable>

      <div className="quick-add-input">
        <Input
          placeholder="+ 快速新增任務，按 Enter 確認..."
          value={quickAddTitle}
          onChange={(e) => setQuickAddTitle(e.target.value)}
          onKeyDown={handleQuickAdd}
          variant="borderless"
          size="small"
        />
      </div>
    </div>
  );
};

export default TaskColumn;
