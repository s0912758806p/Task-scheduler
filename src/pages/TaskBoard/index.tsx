import React from 'react';
import { Typography, Divider } from 'antd';
import TaskColumn from '../../components/TaskColumn';
import TaskForm from '../../components/TaskForm';
import { useAppSelector } from '../../hooks/redux';
import './task-board.scss';

const { Title } = Typography;

const TaskBoard: React.FC = () => {
  const { tasks } = useAppSelector(state => state.tasks);
  
  return (
    <div className="task-board-container">
      <div className="task-board-header">
        <Title level={2}>任務排程器</Title>
        <TaskForm />
      </div>
      
      <Divider />
      
      <div className="task-board">
        <TaskColumn 
          title="待處理" 
          status="todo" 
          tasks={tasks} 
        />
        <TaskColumn 
          title="進行中" 
          status="in-progress" 
          tasks={tasks} 
        />
        <TaskColumn 
          title="已完成" 
          status="done" 
          tasks={tasks} 
        />
      </div>
    </div>
  );
};

export default TaskBoard; 