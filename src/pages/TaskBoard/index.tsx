import React, { useState, useRef } from "react";
import {
  Typography,
  Divider,
  Input,
  Select,
  Space,
  Button,
  message,
  Modal,
} from "antd";
import {
  SearchOutlined,
  FilterOutlined,
  ClearOutlined,
  DownloadOutlined,
  UploadOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";
import { DragDropContext, DropResult } from "@hello-pangea/dnd";
import type { RcFile } from "antd/es/upload";
import TaskColumn from "../../components/TaskColumn";
import TaskForm from "../../components/TaskForm";
import { useAppSelector, useAppDispatch } from "../../hooks/redux";
import { updateTaskStatus, importTasks } from "../../store/taskSlice";
import { TaskStatus, TaskData } from "../../types/task";
import "./task-board.scss";

const { Title } = Typography;
const { Search } = Input;
const { Option } = Select;
const { confirm } = Modal;

interface FilterOptions {
  priority: number | null;
  searchText: string;
  dueDate: "all" | "overdue" | "today" | "week" | "future";
}

const TaskBoard: React.FC = () => {
  const { tasks } = useAppSelector((state) => state.tasks);
  const dispatch = useAppDispatch();

  // 篩選設置狀態
  const [filters, setFilters] = useState<FilterOptions>({
    priority: null,
    searchText: "",
    dueDate: "all",
  });

  // 是否顯示篩選選項
  const [showFilters, setShowFilters] = useState(false);

  // 用於隱藏實際檔案上傳的 input
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result;

    // 如果沒有目的地或目的地與來源相同，則不做任何操作
    if (
      !destination ||
      (destination.droppableId === source.droppableId &&
        destination.index === source.index)
    ) {
      return;
    }

    // 取得目標狀態
    const newStatus = destination.droppableId as TaskStatus;

    // 更新拖拽任務的狀態
    dispatch(updateTaskStatus({ id: draggableId, status: newStatus }));
  };

  // 處理搜索輸入
  const handleSearch = (value: string) => {
    setFilters({
      ...filters,
      searchText: value,
    });
  };

  // 處理優先級篩選
  const handlePriorityChange = (value: number | null) => {
    setFilters({
      ...filters,
      priority: value,
    });
  };

  // 處理到期日篩選
  const handleDueDateChange = (
    value: "all" | "overdue" | "today" | "week" | "future"
  ) => {
    setFilters({
      ...filters,
      dueDate: value,
    });
  };

  // 重設篩選器
  const handleClearFilters = () => {
    setFilters({
      priority: null,
      searchText: "",
      dueDate: "all",
    });
  };

  // 導出任務數據
  const handleExportTasks = () => {
    try {
      // 創建一個包含所有任務的 JSON 文件
      const tasksJson = JSON.stringify(tasks, null, 2);
      const blob = new Blob([tasksJson], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      // 創建一個臨時的 a 標籤以觸發下載
      const link = document.createElement("a");
      link.href = url;
      link.download = `tasks-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(link);
      link.click();

      // 清理
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      message.success("任務數據成功導出");
    } catch (error) {
      console.error("導出任務失敗:", error);
      message.error("導出任務失敗，請再試一次");
    }
  };

  // 導入任務數據
  const handleImportTasks = (file: RcFile) => {
    // 顯示確認對話框
    confirm({
      title: "確定要導入任務數據嗎？",
      icon: <ExclamationCircleOutlined />,
      content: "這將替換當前所有的任務數據。此操作不可撤銷。",
      okText: "確定",
      cancelText: "取消",
      onOk() {
        const reader = new FileReader();

        reader.onload = (e) => {
          try {
            const content = e.target?.result as string;
            const importedTasks = JSON.parse(content) as TaskData[];

            // 確保導入的數據符合預期格式
            if (
              Array.isArray(importedTasks) &&
              importedTasks.every(
                (task) =>
                  typeof task.id === "string" &&
                  typeof task.title === "string" &&
                  typeof task.status === "string"
              )
            ) {
              // 導入任務
              dispatch(importTasks(importedTasks));
              message.success("任務數據成功導入");
            } else {
              message.error("無效的任務數據格式");
            }
          } catch (error) {
            console.error("導入任務失敗:", error);
            message.error("導入任務失敗，請確認文件格式是否正確");
          }
        };

        reader.readAsText(file);
      },
    });

    // 阻止默認上傳行為
    return false;
  };

  // 觸發文件選擇
  const handleClickImport = () => {
    fileInputRef.current?.click();
  };

  // 處理文件選擇
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleImportTasks(files[0] as unknown as RcFile);
      // 重設 input 值，允許重複選擇同一文件
      e.target.value = "";
    }
  };

  // 篩選任務
  const filterTasks = (tasks: TaskData[]): TaskData[] => {
    return tasks.filter((task) => {
      // 搜索文本篩選
      if (
        filters.searchText &&
        !task.title.toLowerCase().includes(filters.searchText.toLowerCase()) &&
        !task.description
          ?.toLowerCase()
          .includes(filters.searchText.toLowerCase())
      ) {
        return false;
      }

      // 優先級篩選
      if (filters.priority !== null && task.priority !== filters.priority) {
        return false;
      }

      // 到期日篩選
      if (filters.dueDate !== "all" && task.dueDate) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTime = today.getTime();

        // 計算一週後的時間
        const nextWeek = new Date(today);
        nextWeek.setDate(today.getDate() + 7);
        const nextWeekTime = nextWeek.getTime();

        // 計算明天的時間（提前定義，避免在case內宣告變數）
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        const tomorrowTime = tomorrow.getTime();

        switch (filters.dueDate) {
          case "overdue":
            if (task.dueDate >= todayTime) return false;
            break;
          case "today":
            if (task.dueDate < todayTime || task.dueDate >= tomorrowTime)
              return false;
            break;
          case "week":
            if (task.dueDate < todayTime || task.dueDate > nextWeekTime)
              return false;
            break;
          case "future":
            if (task.dueDate <= nextWeekTime) return false;
            break;
        }
      } else if (filters.dueDate !== "all" && !task.dueDate) {
        // 如果篩選了到期日但任務沒有到期日，則不顯示
        return false;
      }

      return true;
    });
  };

  const filteredTasks = filterTasks(tasks);

  return (
    <div className="task-board-container">
      <div className="task-board-header">
        <Title level={2}>開始任務</Title>
        <div className="header-actions">
          <Button
            icon={<DownloadOutlined />}
            onClick={handleExportTasks}
            style={{ marginRight: 8 }}
          >
            導出任務
          </Button>
          <Button
            icon={<UploadOutlined />}
            onClick={handleClickImport}
            style={{ marginRight: 8 }}
          >
            導入任務
          </Button>
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: "none" }}
            accept=".json"
            onChange={handleFileChange}
          />
          <TaskForm />
        </div>
      </div>

      <div className="task-board-filters">
        <Search
          placeholder="搜尋任務..."
          allowClear
          enterButton={<SearchOutlined />}
          onSearch={handleSearch}
          style={{ width: 250 }}
          value={filters.searchText}
          onChange={(e) => handleSearch(e.target.value)}
        />

        <Button
          type={showFilters ? "primary" : "default"}
          icon={<FilterOutlined />}
          onClick={() => setShowFilters(!showFilters)}
        >
          篩選選項
        </Button>

        {filters.priority !== null ||
        filters.dueDate !== "all" ||
        filters.searchText ? (
          <Button icon={<ClearOutlined />} onClick={handleClearFilters}>
            清除篩選
          </Button>
        ) : null}
      </div>

      {showFilters && (
        <div className="task-filter-options">
          <Space wrap>
            <div className="filter-group">
              <span className="filter-label">優先級：</span>
              <Select
                style={{ width: 120 }}
                placeholder="全部優先級"
                value={filters.priority}
                onChange={handlePriorityChange}
              >
                <Option value={null}>全部</Option>
                <Option value={0}>緊急</Option>
                <Option value={1}>高</Option>
                <Option value={2}>中</Option>
                <Option value={3}>低</Option>
              </Select>
            </div>

            <div className="filter-group">
              <span className="filter-label">到期日：</span>
              <Select
                style={{ width: 140 }}
                placeholder="全部時間"
                value={filters.dueDate}
                onChange={handleDueDateChange}
              >
                <Option value="all">全部</Option>
                <Option value="overdue">已過期</Option>
                <Option value="today">今天</Option>
                <Option value="week">本週內</Option>
                <Option value="future">未來</Option>
              </Select>
            </div>
          </Space>
        </div>
      )}

      <Divider />

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="task-board">
          <TaskColumn title="待處理" status="todo" tasks={filteredTasks} />
          <TaskColumn
            title="進行中"
            status="in-progress"
            tasks={filteredTasks}
          />
          <TaskColumn title="已完成" status="done" tasks={filteredTasks} />
        </div>
      </DragDropContext>
    </div>
  );
};

export default TaskBoard;
