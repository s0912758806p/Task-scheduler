import React from "react";
import { Card, Col, Row, Statistic, Progress, Typography } from "antd";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  FireOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { TaskData } from "../../types/task";
import { useAppSelector } from "../../hooks/redux";
import "./stats-panel.scss";

const { Text } = Typography;

interface StatsPanelProps {
  tasks: TaskData[];
}

const StatsPanel: React.FC<StatsPanelProps> = ({ tasks }) => {
  const { mode } = useAppSelector((state) => state.theme);
  const isDark = mode === "dark";

  const colors = {
    todo:     isDark ? "#94a3b8" : "#94a3b8",
    progress: isDark ? "#60a5fa" : "#2563eb",
    done:     isDark ? "#4ade80" : "#16a34a",
    error:    isDark ? "#f87171" : "#dc2626",
    ok:       isDark ? "#4ade80" : "#16a34a",
    trail:    isDark ? "rgba(255,255,255,0.06)" : "#f1f5f9",
  };

  const total = tasks.length;
  const todo = tasks.filter((t) => t.status === "todo").length;
  const inProgress = tasks.filter((t) => t.status === "in-progress").length;
  const done = tasks.filter((t) => t.status === "done").length;
  const overdue = tasks.filter(
    (t) => t.dueDate && t.dueDate < Date.now() && t.status !== "done"
  ).length;
  const urgent = tasks.filter((t) => t.priority === 0 && t.status !== "done").length;
  const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="stats-panel">
      <Row gutter={[12, 12]}>
        <Col xs={12} sm={6}>
          <Card size="small" className="stat-card stat-card--todo">
            <Statistic
              title="待處理"
              value={todo}
              prefix={<ClockCircleOutlined style={{ color: colors.todo }} />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" className="stat-card stat-card--progress">
            <Statistic
              title="進行中"
              value={inProgress}
              prefix={<FireOutlined style={{ color: colors.progress }} />}
              valueStyle={{ color: colors.progress }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" className="stat-card stat-card--done">
            <Statistic
              title="已完成"
              value={done}
              prefix={<CheckCircleOutlined style={{ color: colors.done }} />}
              valueStyle={{ color: colors.done }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" className="stat-card stat-card--alert">
            <Statistic
              title="逾期未完成"
              value={overdue}
              prefix={<WarningOutlined style={{ color: overdue > 0 ? colors.error : colors.ok }} />}
              valueStyle={{ color: overdue > 0 ? colors.error : colors.ok }}
            />
          </Card>
        </Col>
      </Row>

      <div className="stats-bottom">
        <div className="stats-progress">
          <div className="progress-label">
            <Text type="secondary" style={{ fontSize: "12px" }}>
              整體完成率
            </Text>
            <Text strong style={{ fontSize: "12px" }}>
              {completionRate}%
            </Text>
          </div>
          <Progress
            percent={completionRate}
            strokeColor={colors.done}
            trailColor={colors.trail}
            showInfo={false}
            size="small"
          />
        </div>

        {urgent > 0 && (
          <Text type="danger" style={{ fontSize: "12px" }}>
            <FireOutlined /> {urgent} 筆緊急任務待處理
          </Text>
        )}
      </div>
    </div>
  );
};

export default StatsPanel;
