// UI state that is not in the URL (spec §6.3): filters, sort, batch selection, command palette and
// the mobile sidebar drawer.
// - setFilters merges a partial TaskFilters; setChip sets (or with null clears) the stats chip;
//   clearFilters resets to EMPTY_FILTERS.
// - toggleBatch flips batch mode; leaving it clears the selection. toggleSelected adds/removes one
//   id; setSelected replaces the selection.
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { EMPTY_FILTERS, type ChipKey, type SortKey, type TaskFilters } from '@/lib/taskQueries';

export interface UiState {
  filters: TaskFilters;
  sort: SortKey;
  batchMode: boolean;
  selectedIds: string[];
  paletteOpen: boolean;
  sidebarOpen: boolean;
}

export const initialUiState: UiState = {
  filters: EMPTY_FILTERS,
  sort: 'manual',
  batchMode: false,
  selectedIds: [],
  paletteOpen: false,
  sidebarOpen: false,
};

export const uiSlice = createSlice({
  name: 'ui',
  initialState: initialUiState,
  reducers: {
    setFilters(state, action: PayloadAction<Partial<TaskFilters>>) {
      state.filters = { ...state.filters, ...action.payload };
    },
    setChip(state, action: PayloadAction<ChipKey | null>) {
      state.filters.chip = action.payload;
    },
    clearFilters(state) {
      state.filters = EMPTY_FILTERS;
    },
    setSort(state, action: PayloadAction<SortKey>) {
      state.sort = action.payload;
    },
    toggleBatch(state) {
      state.batchMode = !state.batchMode;
      if (!state.batchMode) state.selectedIds = [];
    },
    toggleSelected(state, action: PayloadAction<string>) {
      const id = action.payload;
      state.selectedIds = state.selectedIds.includes(id)
        ? state.selectedIds.filter((x) => x !== id)
        : [...state.selectedIds, id];
    },
    setSelected(state, action: PayloadAction<string[]>) {
      state.selectedIds = action.payload;
    },
    setPaletteOpen(state, action: PayloadAction<boolean>) {
      state.paletteOpen = action.payload;
    },
    setSidebarOpen(state, action: PayloadAction<boolean>) {
      state.sidebarOpen = action.payload;
    },
  },
});

export const {
  setFilters,
  setChip,
  clearFilters,
  setSort,
  toggleBatch,
  toggleSelected,
  setSelected,
  setPaletteOpen,
  setSidebarOpen,
} = uiSlice.actions;
