// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeStore } from '@/client/store';
import { setChip, setFilters } from '@/client/uiSlice';
import { StatsStrip } from '@/components/StatsStrip/StatsStrip';
import { sampleTasksAsTasks, TODAY } from '../fixtures/tasks';

afterEach(cleanup);

function setup() {
  const store = makeStore({ toast: vi.fn() });
  const dispatch = vi.spyOn(store, 'dispatch');
  render(
    <Provider store={store}>
      <StatsStrip tasks={sampleTasksAsTasks()} today={TODAY} />
    </Provider>,
  );
  return { store, dispatch };
}

describe('StatsStrip', () => {
  it('shows the completion ring and the four chips with their counts', () => {
    setup();

    // 11 samples, 3 done
    expect(screen.getByRole('img', { name: '完成率 27%' })).toBeTruthy();
    expect(screen.getByText('27% 完成')).toBeTruthy();
    // overdue: 完成專案需求分析 + 實作使用者認證模組; today: 安全性稽核; urgent: 3 open; blocked: CI/CD
    expect(screen.getByRole('button', { name: '逾期 2' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '今天到期 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '緊急 3' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '等待前置 1' })).toBeTruthy();
    expect(screen.getByText('拖曳卡片換欄 · 點卡片看詳情')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '清除篩選' })).toBeNull();
  });

  it('clicking 逾期 dispatches setChip("overdue"); clicking again dispatches setChip(null)', () => {
    const { store, dispatch } = setup();
    const chip = () => screen.getByRole('button', { name: /^逾期/ });

    fireEvent.click(chip());
    expect(dispatch).toHaveBeenLastCalledWith(setChip('overdue'));
    expect(chip().getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(chip());
    expect(dispatch).toHaveBeenLastCalledWith(setChip(null));
    expect(chip().getAttribute('aria-pressed')).toBe('false');
    expect(store.getState().ui.filters.chip).toBeNull();
  });

  it('offers 清除篩選 while any filter is active', () => {
    const { store } = setup();

    act(() => {
      store.dispatch(setFilters({ search: 'API' }));
    });
    fireEvent.click(screen.getByRole('button', { name: '清除篩選' }));

    expect(store.getState().ui.filters.search).toBe('');
    expect(screen.queryByRole('button', { name: '清除篩選' })).toBeNull();
  });
});
