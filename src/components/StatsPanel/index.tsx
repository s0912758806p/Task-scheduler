import React from "react";
import { Card, Col, Row, Statistic, Progress, Typography } from "antd";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  FireOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { TaskData } from "../../types/task";
import "./stats-panel.scss";

const { Text } = Typography;

interface StatsPanelProps {
  tasks: TaskData[];
}

const StatsPanel: React.FC<StatsPanelProps> = ({ tasks }) => {
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
              prefix={<ClockCircleOutlined style={{ color: "#94a3b8" }} />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" className="stat-card stat-card--progress">
            <Statistic
              title="進行中"
              value={inProgress}
              prefix={<FireOutlined style={{ color: "#2563eb" }} />}
              valueStyle={{ color: "#2563eb" }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" className="stat-card stat-card--done">
            <Statistic
              title="已完成"
              value={done}
              prefix={<CheckCircleOutlined style={{ color: "#16a34a" }} />}
              valueStyle={{ color: "#16a34a" }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" className="stat-card stat-card--alert">
            <Statistic
              title="逾期未完成"
              value={overdue}
              prefix={<WarningOutlined style={{ color: overdue > 0 ? "#dc2626" : "#16a34a" }} />}
              valueStyle={{ color: overdue > 0 ? "#dc2626" : "#16a34a" }}
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
            strokeColor="#16a34a"
            trailColor="#f1f5f9"
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
