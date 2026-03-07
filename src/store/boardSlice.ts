import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Board } from "../types/task";

export const DEFAULT_BOARD_ID = "default";

interface BoardState {
  boards: Board[];
  activeBoardId: string;
}

const defaultBoard: Board = {
  id: DEFAULT_BOARD_ID,
  name: "我的看板",
  createdAt: 0,
};

const loadBoards = (): BoardState => {
  try {
    const saved = localStorage.getItem("taskSchedulerBoards");
    if (saved) {
      const parsed: BoardState = JSON.parse(saved);
      // 確保預設看板永遠存在
      if (!parsed.boards.some((b) => b.id === DEFAULT_BOARD_ID)) {
        parsed.boards.unshift(defaultBoard);
      }
      return parsed;
    }
  } catch (e) {
    console.error("Error loading boards:", e);
  }
  return { boards: [defaultBoard], activeBoardId: DEFAULT_BOARD_ID };
};

const persist = (state: BoardState) => {
  localStorage.setItem("taskSchedulerBoards", JSON.stringify({
    boards: state.boards,
    activeBoardId: state.activeBoardId,
  }));
};

const initialState: BoardState = loadBoards();

export const boardSlice = createSlice({
  name: "board",
  initialState,
  reducers: {
    setActiveBoard: (state, action: PayloadAction<string>) => {
      state.activeBoardId = action.payload;
      persist(state);
    },
    createBoard: (state, action: PayloadAction<string>) => {
      const newBoard: Board = {
        id: crypto.randomUUID(),
        name: action.payload.trim() || `看板 ${state.boards.length + 1}`,
        createdAt: Date.now(),
      };
      state.boards.push(newBoard);
      state.activeBoardId = newBoard.id;
      persist(state);
    },
    renameBoard: (state, action: PayloadAction<{ id: string; name: string }>) => {
      const board = state.boards.find((b) => b.id === action.payload.id);
      if (board && action.payload.name.trim()) {
        board.name = action.payload.name.trim();
        persist(state);
      }
    },
    deleteBoard: (state, action: PayloadAction<string>) => {
      if (state.boards.length <= 1) return; // 至少保留一個看板
      state.boards = state.boards.filter((b) => b.id !== action.payload);
      if (state.activeBoardId === action.payload) {
        state.activeBoardId = state.boards[0].id;
      }
      persist(state);
    },
  },
});

export const { setActiveBoard, createBoard, renameBoard, deleteBoard } = boardSlice.actions;
export default boardSlice.reducer;
