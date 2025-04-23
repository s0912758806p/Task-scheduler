import React from "react";
import { Switch, Tooltip } from "antd";
import { MoonOutlined, SunOutlined } from "@ant-design/icons";
import { useAppSelector, useAppDispatch } from "../../hooks/redux";
import { toggleTheme } from "../../store/themeSlice";
import "./theme-toggle.scss";

const ThemeToggle: React.FC = () => {
  const { mode } = useAppSelector((state) => state.theme);
  const dispatch = useAppDispatch();

  const handleToggle = () => {
    dispatch(toggleTheme());
  };

  const tooltipTitle = mode === "dark" ? "切換至亮色模式" : "切換至暗色模式";

  return (
    <div className="theme-toggle">
      <Tooltip title={tooltipTitle} placement="bottom">
        <Switch
          checked={mode === "dark"}
          onChange={handleToggle}
          checkedChildren={<MoonOutlined />}
          unCheckedChildren={<SunOutlined />}
        />
      </Tooltip>
    </div>
  );
};

export default ThemeToggle;
