import React from 'react';
import { Layout } from 'antd';
import { Provider } from 'react-redux';
import { store } from './store';
import TaskBoard from './pages/TaskBoard';
import './styles/global.scss';
import './styles/app.scss';

const { Header, Content } = Layout;

const App: React.FC = () => {
  return (
    <Provider store={store}>
      <Layout className="app-container">
        <Header className="app-header">
          <h1>任務排程系統</h1>
        </Header>
        <Content className="app-content">
          <TaskBoard />
        </Content>
      </Layout>
    </Provider>
  );
};

export default App;
