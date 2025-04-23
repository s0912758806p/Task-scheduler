import React, { useEffect } from "react";
import { Layout, ConfigProvider, theme as antTheme } from "antd";
import { Provider, useSelector } from "react-redux";
import { store } from "./store";
import TaskBoard from "./pages/TaskBoard/index";
import ThemeToggle from "./components/ThemeToggle";
import { RootState } from "./store";
import "./styles/global.scss";
import "./styles/app.scss";

const { Header, Content } = Layout;

const AppContent: React.FC = () => {
  const { mode } = useSelector((state: RootState) => state.theme);

  // 當主題變更時，更新 body 的類名
  useEffect(() => {
    document.body.className = mode === "dark" ? "dark-theme" : "light-theme";
  }, [mode]);

  return (
    <ConfigProvider
      theme={{
        algorithm:
          mode === "dark" ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
        token: {
          // 根據模式設置不同的主色調
          colorPrimary: mode === "dark" ? "#fa8c16" : "#1890ff",
        },
      }}
    >
      <Layout className={`app-container ${mode}-theme`}>
        <Header className="app-header">
          <div className="header-content">
            <h1>任務排程器</h1>
            <ThemeToggle />
          </div>
        </Header>
        <Content className="app-content">
          <TaskBoard />
        </Content>
      </Layout>
    </ConfigProvider>
  );
};

const App: React.FC = () => {
  return (
    <Provider store={store}>
      <AppContent />
    </Provider>
  );
};

export default App;
