import React from "react";
import { Card, Typography, Badge } from "antd";
import { Droppable } from "@hello-pangea/dnd";
import { TaskData, TaskStatus } from "../../types/task";
import Task from "../Task";
import "./task-column.scss";

const { Title } = Typography;

interface TaskColumnProps {
  title: string;
  status: TaskStatus;
  tasks: TaskData[];
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
    case "todo":
      return "#d9d9d9";
    case "in-progress":
      return "#1890ff";
    case "done":
      return "#52c41a";
    default:
      return "#d9d9d9";
  }
};

const TaskColumn: React.FC<TaskColumnProps> = ({ title, status, tasks }) => {
  const filteredTasks = tasks.filter((task) => task.status === status);

  return (
    <div className="task-column">
      <div className="column-header">
        <Title level={4}>
          <Badge className="badge" color={getStatusColor(status)} />
          {title || getStatusTitle(status)}
          <span className="task-count">({filteredTasks.length})</span>
        </Title>
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
                <Task key={task.id} index={index} {...task} />
              ))
            )}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
};

export default TaskColumn;
