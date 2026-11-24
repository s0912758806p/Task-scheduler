// Redux store: uiSlice + the RTK Query api slice. makeStore(extra) builds one store per browser tab
// (app/providers.tsx keeps it in state); `extra` is the thunk extra argument the api slice uses to
// post toasts (ApiExtra).
import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector, useStore } from 'react-redux';
import { api, type ApiExtra } from './api';
import { uiSlice } from './uiSlice';

export function makeStore(extra: ApiExtra) {
  return configureStore({
    reducer: {
      ui: uiSlice.reducer,
      [api.reducerPath]: api.reducer,
    },
    middleware: (getDefault) => getDefault({ thunk: { extraArgument: extra } }).concat(api.middleware),
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
export const useAppStore = useStore.withTypes<AppStore>();
