import React, { useState } from "react";
import {
  Card,
  Tag,
  Button,
  Space,
  Typography,
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  Checkbox,
  Progress,
} from "antd";
import {
  RightOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  EditOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  PlusOutlined,
  MinusCircleOutlined,
  LockOutlined,
} from "@ant-design/icons";
import { Draggable } from "@hello-pangea/dnd";
import dayjs from "dayjs";
import { TaskData, TaskStatus, Subtask } from "../../types/task";
import { useAppDispatch, useAppSelector } from "../../hooks/redux";
import { updateTaskStatus, updateTask, deleteTask } from "../../store/taskSlice";
import "./task.scss";

const { Text, Paragraph } = Typography;
const { Option } = Select;
const { TextArea } = Input;
const { confirm } = Modal;

interface TaskProps extends TaskData {
  index: number;
  batchMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}

const getStatusColor = (status: TaskStatus) => {
  switch (status) {
    case "todo":      return "default";
    case "in-progress": return "processing";
    case "done":      return "success";
    default:          return "default";
  }
};

const getPriorityLabel = (priority: number) => {
  switch (priority) {
    case 0: return { label: "緊急", color: "red" };
    case 1: return { label: "高",   color: "orange" };
    case 2: return { label: "中",   color: "blue" };
    case 3: return { label: "低",   color: "green" };
    default: return { label: "未知", color: "default" };
  }
};

const getNextStatus = (status: TaskStatus): TaskStatus => {
  switch (status) {
    case "todo":        return "in-progress";
    case "in-progress": return "done";
    case "done":        return "todo";
    default:            return "todo";
  }
};

const Task: React.FC<TaskProps> = ({
  id, boardId, title, description, status, priority,
  createdAt, dueDate, completedAt, tags, subtasks, dependsOn, index,
  batchMode = false, isSelected = false, onToggleSelect,
}) => {
  const dispatch = useAppDispatch();
  const allTasks = useAppSelector((state) => state.tasks.tasks);
  const activeBoardId = useAppSelector((state) => state.board.activeBoardId);

  // 同看板的其他任務（供依賴選擇）
  const boardTasks = allTasks.filter((t) => t.boardId === activeBoardId && t.id !== id);

  // 是否被前置任務封鎖（前置任務未完成）
  const isBlocked =
    dependsOn && dependsOn.length > 0
      ? dependsOn.some((depId) => {
          const dep = allTasks.find((t) => t.id === depId);
          return dep && dep.status !== "done";
        })
      : false;
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [form] = Form.useForm();

  const handleMoveClick = () => {
    dispatch(updateTaskStatus({ id, status: getNextStatus(status) }));
  };

  const handleSubtaskToggle = (subtaskId: string, done: boolean) => {
    const updatedSubtasks = (subtasks || []).map((s) =>
      s.id === subtaskId ? { ...s, done } : s
    );
    dispatch(updateTask({
      id, boardId, title, description, status, priority,
      dueDate, completedAt, tags, createdAt,
      subtasks: updatedSubtasks,
    }));
  };

  const handleEditClick = () => {
    form.setFieldsValue({
      title, description, status,
      priority: String(priority),
      dueDate: dueDate ? dayjs(dueDate) : undefined,
      tags: tags || [],
      subtasks: subtasks || [],
      dependsOn: dependsOn || [],
    });
    setIsEditModalVisible(true);
  };

  const handleEditSubmit = () => {
    form.validateFields().then((values) => {
      const rawSubtasks: Array<{ id?: string; title: string; done?: boolean }> =
        values.subtasks || [];
      const cleanSubtasks: Subtask[] = rawSubtasks
        .filter((s) => s.title?.trim())
        .map((s) => ({
          id: s.id || crypto.randomUUID(),
          title: s.title.trim(),
          done: s.done || false,
        }));

      dispatch(updateTask({
        id,
        boardId,
        title: values.title,
        description: values.description,
        status: values.status as TaskStatus,
        priority: Number(values.priority),
        dueDate: values.dueDate ? values.dueDate.valueOf() : undefined,
        tags: values.tags || [],
        subtasks: cleanSubtasks,
        dependsOn: values.dependsOn || [],
        createdAt,
      }));
      setIsEditModalVisible(false);
    });
  };

  const handleDeleteClick = () => {
    confirm({
      title: "確定要刪除此任務嗎？",
      icon: <ExclamationCircleOutlined />,
      content: `「${title}」將被永久刪除，此操作不可撤銷。`,
      okText: "刪除",
      okType: "danger",
      cancelText: "取消",
      onOk() { dispatch(deleteTask(id)); },
    });
  };

  const isOverdue = !!dueDate && dueDate < Date.now() && status !== "done";
  const priorityInfo = getPriorityLabel(priority);
  const doneCount = subtasks?.filter((s) => s.done).length ?? 0;
  const totalCount = subtasks?.length ?? 0;

  const formatDate = (timestamp: number) =>
    new Date(timestamp).toLocaleDateString("zh-TW", {
      year: "numeric", month: "short", day: "numeric",
    });

  return (
    <>
      <Draggable draggableId={id} index={index}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            className={`task-draggable ${snapshot.isDragging ? "is-dragging" : ""}`}
          >
            <Card
              className={`task-card priority-${priority}${isOverdue ? " is-overdue" : ""}${isBlocked ? " is-blocked" : ""}`}
              size="small"
              title={
                <div className="task-header">
                  {batchMode && (
                    <Checkbox
                      checked={isSelected}
                      onClick={(e) => { e.stopPropagation(); onToggleSelect?.(id); }}
                      style={{ marginRight: 8, flexShrink: 0 }}
                    />
                  )}
                  <Text strong>{title}</Text>
                  <Tag color={getStatusColor(status)}>
                    {status === "todo" ? "待處理" : status === "in-progress" ? "進行中" : "已完成"}
                  </Tag>
                </div>
              }
              extra={<Tag color={priorityInfo.color}>{priorityInfo.label}</Tag>}
            >
              {description && (
                <Paragraph ellipsis={{ rows: 2, expandable: true, symbol: "展開" }}>
                  {description}
                </Paragraph>
              )}

              {tags && tags.length > 0 && (
                <div className="task-tags">
                  <Space size={4} wrap>
                    {tags.map((tag) => (
                      <Tag key={tag} color="default" style={{ fontSize: "11px", margin: 0 }}>
                        {tag}
                      </Tag>
                    ))}
                  </Space>
                </div>
              )}

              {subtasks && subtasks.length > 0 && (
                <div className="task-subtasks">
                  <div className="subtasks-header">
                    <Text type="secondary" style={{ fontSize: "11px" }}>
                      子任務 {doneCount}/{totalCount}
                    </Text>
                    <Progress
                      percent={Math.round((doneCount / totalCount) * 100)}
                      size="small"
                      showInfo={false}
                      style={{ flex: 1, marginLeft: 8, marginBottom: 0 }}
                    />
                  </div>
                  <div className="subtasks-list">
                    {subtasks.map((subtask) => (
                      <div key={subtask.id} className="subtask-item">
                        <Checkbox
                          checked={subtask.done}
                          onChange={(e) => handleSubtaskToggle(subtask.id, e.target.checked)}
                        >
                          <Text
                            delete={subtask.done}
                            type={subtask.done ? "secondary" : undefined}
                            style={{ fontSize: "12px" }}
                          >
                            {subtask.title}
                          </Text>
                        </Checkbox>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="task-dates">
                <Space wrap>
                  <Text type="secondary" style={{ fontSize: "12px" }}>
                    <ClockCircleOutlined /> 建立: {formatDate(createdAt)}
                  </Text>
                  {dueDate && (
                    <Text
                      type={isOverdue ? "danger" : "secondary"}
                      style={{ fontSize: "12px" }}
                    >
                      {isOverdue ? <WarningOutlined /> : <CalendarOutlined />}{" "}
                      到期: {formatDate(dueDate)}
                    </Text>
                  )}
                  {status === "done" && completedAt && (
                    <Text type="success" style={{ fontSize: "12px" }}>
                      <CheckCircleOutlined /> 完成: {formatDate(completedAt)}
                    </Text>
                  )}
                </Space>
              </div>

              {isBlocked && (
                <div className="task-blocked-hint">
                  <LockOutlined /> 等待前置任務完成
                </div>
              )}

              <div className="task-actions">
                <Space>
                  <Button
                    type="primary"
                    size="small"
                    onClick={handleMoveClick}
                    icon={<RightOutlined />}
                    disabled={isBlocked && status === "todo"}
                  >
                    {status === "todo" ? "開始處理" : status === "in-progress" ? "標記完成" : "重新開始"}
                  </Button>
                  <Button size="small" icon={<EditOutlined />} onClick={handleEditClick}>
                    編輯
                  </Button>
                  <Button size="small" danger icon={<DeleteOutlined />} onClick={handleDeleteClick} />
                </Space>
              </div>
            </Card>
          </div>
        )}
      </Draggable>

      <Modal
        title="編輯任務"
        open={isEditModalVisible}
        onCancel={() => setIsEditModalVisible(false)}
        footer={null}
        width={520}
      >
        <Form form={form} layout="vertical" onFinish={handleEditSubmit}>
          <Form.Item name="title" label="任務名稱" rules={[{ required: true, message: "請輸入任務名稱" }]}>
            <Input placeholder="請輸入任務名稱" />
          </Form.Item>

          <Form.Item name="description" label="任務描述">
            <TextArea rows={3} placeholder="請輸入任務描述（選填）" />
          </Form.Item>

          <Form.Item name="status" label="狀態" rules={[{ required: true, message: "請選擇狀態" }]}>
            <Select>
              <Option value="todo">待處理</Option>
              <Option value="in-progress">進行中</Option>
              <Option value="done">已完成</Option>
            </Select>
          </Form.Item>

          <Form.Item name="priority" label="優先級" rules={[{ required: true, message: "請選擇優先級" }]}>
            <Select>
              <Option value="0">緊急</Option>
              <Option value="1">高</Option>
              <Option value="2">中</Option>
              <Option value="3">低</Option>
            </Select>
          </Form.Item>

          <Form.Item name="dueDate" label="截止日期">
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>

          <Form.Item name="tags" label="標籤">
            <Select mode="tags" placeholder="輸入標籤後按 Enter 新增（選填）" style={{ width: "100%" }} />
          </Form.Item>

          {boardTasks.length > 0 && (
            <Form.Item name="dependsOn" label="前置任務（完成後才能開始）">
              <Select
                mode="multiple"
                placeholder="選擇前置任務（選填）"
                style={{ width: "100%" }}
                options={boardTasks.map((t) => ({
                  label: `${t.status === "done" ? "✓ " : ""}${t.title}`,
                  value: t.id,
                }))}
              />
            </Form.Item>
          )}

          <Form.Item label="子任務">
            <Form.List name="subtasks">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(({ key, name, ...restField }) => (
                    <Space key={key} align="center" style={{ display: "flex", marginBottom: 6 }}>
                      <Form.Item {...restField} name={[name, "done"]} valuePropName="checked" style={{ marginBottom: 0 }}>
                        <Checkbox />
                      </Form.Item>
                      <Form.Item {...restField} name={[name, "title"]} style={{ marginBottom: 0, flex: 1 }}>
                        <Input placeholder="子任務名稱" style={{ width: 300 }} />
                      </Form.Item>
                      <MinusCircleOutlined
                        style={{ color: "#ff4d4f", cursor: "pointer", fontSize: 16 }}
                        onClick={() => remove(name)}
                      />
                    </Space>
                  ))}
                  <Button
                    type="dashed"
                    onClick={() => add({ title: "", done: false })}
                    icon={<PlusOutlined />}
                    size="small"
                    block
                  >
                    新增子任務
                  </Button>
                </>
              )}
            </Form.List>
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: "right" }}>
            <Space>
              <Button onClick={() => setIsEditModalVisible(false)}>取消</Button>
              <Button type="primary" htmlType="submit">儲存</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default Task;
