import React from "react";
import { Card, Tag, Button, Space, Typography } from "antd";
import {
  RightOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import { Draggable } from "@hello-pangea/dnd";
import { TaskData, TaskStatus } from "../../types/task";
import { useAppDispatch } from "../../hooks/redux";
import { updateTaskStatus } from "../../store/taskSlice";
import "./task.scss";

const { Text, Paragraph } = Typography;

interface TaskProps extends TaskData {
  index: number; // 為了 Draggable 所需增加 index 屬性
}

const getStatusColor = (status: TaskStatus) => {
  switch (status) {
    case "todo":
      return "default";
    case "in-progress":
      return "processing";
    case "done":
      return "success";
    default:
      return "default";
  }
};

const getPriorityLabel = (priority: number) => {
  switch (priority) {
    case 0:
      return { label: "緊急", color: "red" };
    case 1:
      return { label: "高", color: "orange" };
    case 2:
      return { label: "中", color: "blue" };
    case 3:
      return { label: "低", color: "green" };
    default:
      return { label: "未知", color: "default" };
  }
};

const getNextStatus = (status: TaskStatus): TaskStatus => {
  switch (status) {
    case "todo":
      return "in-progress";
    case "in-progress":
      return "done";
    case "done":
      return "todo";
    default:
      return "todo";
  }
};

const Task: React.FC<TaskProps> = ({
  id,
  title,
  description,
  status,
  priority,
  createdAt,
  dueDate,
  index,
}) => {
  const dispatch = useAppDispatch();

  const handleMoveClick = () => {
    const nextStatus = getNextStatus(status);
    dispatch(updateTaskStatus({ id, status: nextStatus }));
  };

  const priorityInfo = getPriorityLabel(priority);

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("zh-TW", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <Draggable draggableId={id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`task-draggable ${
            snapshot.isDragging ? "is-dragging" : ""
          }`}
        >
          <Card
            className={`task-card priority-${priority}`}
            size="small"
            title={
              <div className="task-header">
                <Text strong>{title}</Text>
                <Tag color={getStatusColor(status)}>
                  {status === "todo"
                    ? "待處理"
                    : status === "in-progress"
                    ? "進行中"
                    : "已完成"}
                </Tag>
              </div>
            }
            extra={<Tag color={priorityInfo.color}>{priorityInfo.label}</Tag>}
          >
            {description && (
              <Paragraph ellipsis={{ rows: 2 }}>{description}</Paragraph>
            )}

            <div className="task-dates">
              <Space>
                <Text type="secondary" style={{ fontSize: "12px" }}>
                  <ClockCircleOutlined /> 建立: {formatDate(createdAt)}
                </Text>
                {dueDate && (
                  <Text type="secondary" style={{ fontSize: "12px" }}>
                    <CalendarOutlined /> 到期: {formatDate(dueDate)}
                  </Text>
                )}
              </Space>
            </div>

            <div className="task-actions">
              <Button
                type="primary"
                size="small"
                onClick={handleMoveClick}
                icon={<RightOutlined />}
              >
                {status === "todo"
                  ? "開始處理"
                  : status === "in-progress"
                  ? "標記完成"
                  : "重新開始"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </Draggable>
  );
};

export default Task;
