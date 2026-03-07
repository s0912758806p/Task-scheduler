import React, { useState, useRef, useEffect, useMemo } from "react";
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
import type { InputRef } from "antd";
import {
  SearchOutlined,
  FilterOutlined,
  ClearOutlined,
  DownloadOutlined,
  UploadOutlined,
  ExclamationCircleOutlined,
  UndoOutlined,
  RedoOutlined,
  CheckSquareOutlined,
  CloseSquareOutlined,
  BarChartOutlined,
} from "@ant-design/icons";
import { DragDropContext, DropResult } from "@hello-pangea/dnd";
import type { RcFile } from "antd/es/upload";
import TaskColumn from "../../components/TaskColumn";
import TaskForm, { TaskFormHandle } from "../../components/TaskForm";
import StatsPanel from "../../components/StatsPanel";
import { useNotifications } from "../../hooks/useNotifications";
import { useAppSelector, useAppDispatch } from "../../hooks/redux";
import { updateTaskStatus, importTasks, reorderTask, undo, redo, batchDeleteTasks, batchUpdateStatus } from "../../store/taskSlice";
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
  tags: string[];
}

const TaskBoard: React.FC = () => {
  const { tasks: allTasks, past, future } = useAppSelector((state) => state.tasks);
  const { activeBoardId } = useAppSelector((state) => state.board);
  const tasks = allTasks.filter((t) => t.boardId === activeBoardId);
  const canUndo = past.length > 0;
  const canRedo = future.length > 0;

  useNotifications(tasks);
  const dispatch = useAppDispatch();

  // 篩選設置狀態
  const [filters, setFilters] = useState<FilterOptions>({
    priority: null,
    searchText: "",
    dueDate: "all",
    tags: [],
  });

  // 是否顯示篩選選項
  const [showFilters, setShowFilters] = useState(false);

  // 排序方式
  const [sortBy, setSortBy] = useState<"default" | "priority" | "dueDate">("default");

  // 用於隱藏實際檔案上傳的 input
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 鍵盤快捷鍵用的 refs
  const addTaskRef = useRef<TaskFormHandle>(null);
  const searchRef = useRef<InputRef>(null);

  // 統計面板
  const [showStats, setShowStats] = useState(true);

  // 批次操作狀態
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    const allVisibleIds = filteredAndSortedTasks.map((t) => t.id);
    setSelectedIds(
      selectedIds.length === allVisibleIds.length ? [] : allVisibleIds
    );
  };

  const handleExitBatch = () => {
    setBatchMode(false);
    setSelectedIds([]);
  };

  const handleBatchDelete = () => {
    confirm({
      title: `確定要刪除 ${selectedIds.length} 筆任務嗎？`,
      icon: <ExclamationCircleOutlined />,
      content: "此操作不可撤銷（可用 Ctrl+Z 復原）。",
      okText: "刪除",
      okType: "danger",
      cancelText: "取消",
      onOk() {
        dispatch(batchDeleteTasks(selectedIds));
        handleExitBatch();
      },
    });
  };

  const handleBatchMove = (status: TaskStatus) => {
    dispatch(batchUpdateStatus({ ids: selectedIds, status }));
    handleExitBatch();
  };

  // 所有任務的唯一標籤
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    tasks.forEach((task) => task.tags?.forEach((tag) => tagSet.add(tag)));
    return Array.from(tagSet);
  }, [tasks]);

  // 鍵盤快捷鍵
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) return;

      if (e.key === "n" || e.key === "N") {
        addTaskRef.current?.open();
      }
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      }

      const isMod = e.ctrlKey || e.metaKey;
      if (isMod && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        dispatch(undo());
      }
      if (isMod && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        dispatch(redo());
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) return;

    if (destination.droppableId === source.droppableId) {
      // 同欄重排
      const status = source.droppableId as TaskStatus;
      const columnTasks = filteredAndSortedTasks.filter((t) => t.status === status);
      const ids = columnTasks.map((t) => t.id);
      const [moved] = ids.splice(source.index, 1);
      ids.splice(destination.index, 0, moved);
      dispatch(reorderTask({ status, orderedIds: ids }));
    } else {
      // 跨欄移動
      dispatch(updateTaskStatus({ id: draggableId, status: destination.droppableId as TaskStatus }));
    }
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
      tags: [],
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

      // 標籤篩選
      if (filters.tags.length > 0) {
        if (
          !task.tags ||
          !filters.tags.every((tag) => task.tags!.includes(tag))
        ) {
          return false;
        }
      }

      return true;
    });
  };

  const sortTasks = (list: TaskData[]): TaskData[] => {
    if (sortBy === "priority") {
      return [...list].sort((a, b) => a.priority - b.priority);
    }
    if (sortBy === "dueDate") {
      return [...list].sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate - b.dueDate;
      });
    }
    return list;
  };

  const filteredAndSortedTasks = sortTasks(filterTasks(tasks));

  return (
    <div className="task-board-container">
      <div className="task-board-header">
        <Title level={2}>開始任務</Title>
        <div className="header-actions">
          <Button
            type={showStats ? "primary" : "default"}
            icon={<BarChartOutlined />}
            onClick={() => setShowStats(!showStats)}
            title="統計面板"
          />
          <Button
            icon={<UndoOutlined />}
            onClick={() => dispatch(undo())}
            disabled={!canUndo}
            title="復原 (Ctrl+Z)"
          />
          <Button
            icon={<RedoOutlined />}
            onClick={() => dispatch(redo())}
            disabled={!canRedo}
            title="重做 (Ctrl+Y)"
          />
          <Button
            icon={<DownloadOutlined />}
            onClick={handleExportTasks}
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
          <TaskForm ref={addTaskRef} />
        </div>
      </div>

      {showStats && <StatsPanel tasks={tasks} />}

      <div className="task-board-filters">
        <Search
          ref={searchRef}
          placeholder="搜尋任務... (快捷鍵: /)"
          allowClear
          enterButton={<SearchOutlined />}
          onSearch={handleSearch}
          style={{ width: 260 }}
          value={filters.searchText}
          onChange={(e) => handleSearch(e.target.value)}
        />

        <Select
          value={sortBy}
          onChange={setSortBy}
          style={{ width: 130 }}
        >
          <Option value="default">預設排序</Option>
          <Option value="priority">按優先級</Option>
          <Option value="dueDate">按截止日期</Option>
        </Select>

        <Button
          type={showFilters ? "primary" : "default"}
          icon={<FilterOutlined />}
          onClick={() => setShowFilters(!showFilters)}
        >
          篩選選項
        </Button>

        {filters.priority !== null ||
        filters.dueDate !== "all" ||
        filters.searchText ||
        filters.tags.length > 0 ? (
          <Button icon={<ClearOutlined />} onClick={handleClearFilters}>
            清除篩選
          </Button>
        ) : null}

        <Button
          type={batchMode ? "primary" : "default"}
          icon={batchMode ? <CloseSquareOutlined /> : <CheckSquareOutlined />}
          onClick={() => (batchMode ? handleExitBatch() : setBatchMode(true))}
        >
          {batchMode ? "結束選取" : "批次操作"}
        </Button>
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

            {allTags.length > 0 && (
              <div className="filter-group">
                <span className="filter-label">標籤：</span>
                <Select
                  mode="multiple"
                  style={{ minWidth: 160 }}
                  placeholder="全部標籤"
                  value={filters.tags}
                  onChange={(value) => setFilters({ ...filters, tags: value })}
                  options={allTags.map((tag) => ({ label: tag, value: tag }))}
                />
              </div>
            )}
          </Space>
        </div>
      )}

      {batchMode && (
        <div className="batch-action-bar">
          <Space wrap>
            <Button size="small" onClick={handleSelectAll}>
              {selectedIds.length === filteredAndSortedTasks.length && filteredAndSortedTasks.length > 0
                ? "取消全選"
                : "全選"}
            </Button>
            {selectedIds.length > 0 && (
              <>
                <span className="batch-count">已選 {selectedIds.length} 筆</span>
                <Button size="small" onClick={() => handleBatchMove("todo")}>移至待處理</Button>
                <Button size="small" onClick={() => handleBatchMove("in-progress")}>移至進行中</Button>
                <Button size="small" onClick={() => handleBatchMove("done")}>移至已完成</Button>
                <Button size="small" danger onClick={handleBatchDelete}>刪除選取</Button>
              </>
            )}
          </Space>
        </div>
      )}

      <Divider />

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="task-board">
          {(["todo", "in-progress", "done"] as const).map((status) => (
            <TaskColumn
              key={status}
              title={status === "todo" ? "待處理" : status === "in-progress" ? "進行中" : "已完成"}
              status={status}
              tasks={filteredAndSortedTasks}
              batchMode={batchMode}
              selectedIds={selectedIds}
              onToggleSelect={handleToggleSelect}
            />
          ))}
        </div>
      </DragDropContext>
    </div>
  );
};

export default TaskBoard;
