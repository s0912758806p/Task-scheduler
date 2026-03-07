import { configureStore } from "@reduxjs/toolkit";
import tasksReducer from "./taskSlice";
import themeReducer from "./themeSlice";
import boardReducer from "./boardSlice";

// 建立 store
export const store = configureStore({
  reducer: {
    tasks: tasksReducer,
    theme: themeReducer,
    board: boardReducer,
  },
});

// 匯出類型定義
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
