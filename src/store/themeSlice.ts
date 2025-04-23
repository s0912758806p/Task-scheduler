import { createSlice, PayloadAction } from "@reduxjs/toolkit";

// 檢查用戶系統偏好或本地儲存設置
const getUserPreferredTheme = (): "light" | "dark" => {
  // 先檢查本地儲存的設置
  const savedTheme = localStorage.getItem("taskSchedulerTheme");
  if (savedTheme === "light" || savedTheme === "dark") {
    return savedTheme;
  }

  // 檢查系統偏好
  if (
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }

  // 默認使用亮色主題
  return "light";
};

interface ThemeState {
  mode: "light" | "dark";
}

const initialState: ThemeState = {
  mode: getUserPreferredTheme(),
};

export const themeSlice = createSlice({
  name: "theme",
  initialState,
  reducers: {
    toggleTheme: (state) => {
      state.mode = state.mode === "light" ? "dark" : "light";
      localStorage.setItem("taskSchedulerTheme", state.mode);
    },
    setTheme: (state, action: PayloadAction<"light" | "dark">) => {
      state.mode = action.payload;
      localStorage.setItem("taskSchedulerTheme", state.mode);
    },
  },
});

export const { toggleTheme, setTheme } = themeSlice.actions;

export default themeSlice.reducer;
