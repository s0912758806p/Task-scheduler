// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeStore } from '@/client/store';
import { ThemeProvider } from '@/client/theme';
import { setPaletteOpen, toggleBatch } from '@/client/uiSlice';
import { createToaster, createUndoStack, UndoProvider } from '@/client/undo';
import { useShortcuts } from '@/client/useShortcuts';
import type { Board } from '@/lib/types';
import { stubBrowserApis } from '../helpers/dom';
import { installFetch, jsonResponse, route } from '../helpers/fetch';

const push = vi.fn();
let pathname = '/b/b1';
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}));

const boards: Board[] = ['b1', 'b2'].map((id, i) => ({
  id,
  name: id,
  position: i,
  createdAt: '2026-11-01T00:00:00.000Z',
  openCount: 0,
}));

function Harness() {
  useShortcuts();
  return (
    <div>
      <input aria-label="text" />
      <input data-search-input aria-label="search" />
    </div>
  );
}

let store: ReturnType<typeof makeStore>;
const stack = createUndoStack();

beforeEach(() => {
  stubBrowserApis();
  push.mockReset();
  pathname = '/b/b1';
  installFetch((req) =>
    route(req) === 'GET /api/boards' ? jsonResponse(boards) : jsonResponse({ error: { code: 'X', message: 'x' } }, 404),
  );
  mount();
});
function mount() {
  const toaster = createToaster();
  store = makeStore({ toast: toaster.show });
  render(
    <ThemeProvider initial="light">
      <Provider store={store}>
        <UndoProvider stack={stack} toaster={toaster}>
          <Harness />
        </UndoProvider>
      </Provider>
    </ThemeProvider>,
  );
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const press = (key: string, init: KeyboardEventInit = {}, target: Element = document.body) =>
  fireEvent.keyDown(target, { key, ...init });

describe('useShortcuts', () => {
  it('N opens the new-task panel from the body but not from an input', () => {
    press('n');
    expect(push).toHaveBeenCalledWith('?task=new', { scroll: false });
    push.mockClear();
    press('n', {}, screen.getByLabelText('text'));
    expect(push).not.toHaveBeenCalled();
  });

  it('⌘K / Ctrl+K opens the palette, even inside an input', () => {
    press('k', { metaKey: true });
    expect(store.getState().ui.paletteOpen).toBe(true);
    store.dispatch(setPaletteOpen(false));
    press('k', { ctrlKey: true }, screen.getByLabelText('text'));
    expect(store.getState().ui.paletteOpen).toBe(true);
  });

  it('ignores IME composition, handled events and modified single keys', () => {
    press('n', { isComposing: true });
    press('n', { keyCode: 229 });
    press('n', { metaKey: true });
    expect(push).not.toHaveBeenCalled();
  });

  it('1–9 go to the Nth board in sidebar order', async () => {
    await waitFor(() => {
      press('2');
      expect(push).toHaveBeenCalledWith('/b/b2');
    });
    push.mockClear();
    press('9');
    expect(push).not.toHaveBeenCalled();
  });

  it('G then F within 1 s goes to /focus; later, or without G, does not', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    press('g');
    vi.setSystemTime(Date.now() + 500);
    press('f');
    expect(push).toHaveBeenCalledWith('/focus');
    push.mockClear();
    press('g');
    vi.setSystemTime(Date.now() + 1500);
    press('f');
    press('f');
    expect(push).not.toHaveBeenCalled();
  });

  it('/ opens the filter popover on a board and the palette in batch mode or on /focus', () => {
    press('/');
    expect(store.getState().ui.filterOpen).toBe(true);
    expect(store.getState().ui.paletteOpen).toBe(false);

    store.dispatch(toggleBatch());
    press('/');
    expect(store.getState().ui.paletteOpen).toBe(true);
  });

  it('/ on /focus opens the palette', () => {
    cleanup();
    pathname = '/focus';
    mount();
    press('/');
    expect(store.getState().ui.paletteOpen).toBe(true);
    expect(store.getState().ui.filterOpen).toBe(false);
  });

  it('? opens the shortcuts dialog', () => {
    press('?', { shiftKey: true });
    expect(store.getState().ui.shortcutsOpen).toBe(true);
  });

  it('⌘Z / ⌘⇧Z / Ctrl+Y call undo/redo outside fields and leave native undo inside them', async () => {
    const undo = vi.fn().mockResolvedValue(undefined);
    const redo = vi.fn().mockResolvedValue(undefined);
    const u = vi.spyOn(stack, 'undo').mockImplementation(undo);
    const r = vi.spyOn(stack, 'redo').mockImplementation(redo);
    press('z', { metaKey: true });
    press('z', { metaKey: true, shiftKey: true });
    press('y', { ctrlKey: true });
    await act(async () => {});
    expect(u).toHaveBeenCalledTimes(1);
    expect(r).toHaveBeenCalledTimes(2);
    press('z', { metaKey: true }, screen.getByLabelText('text'));
    press('y', { ctrlKey: true }, screen.getByLabelText('text'));
    expect(u).toHaveBeenCalledTimes(1);
    expect(r).toHaveBeenCalledTimes(2);
  });

  it('does not handle Esc', () => {
    press('Escape');
    expect(push).not.toHaveBeenCalled();
    expect(store.getState().ui.paletteOpen).toBe(false);
  });
});
