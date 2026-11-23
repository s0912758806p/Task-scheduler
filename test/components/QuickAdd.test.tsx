// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuickAdd } from '@/components/QuickAdd/QuickAdd';
import { TODAY } from '../fixtures/tasks';

afterEach(cleanup);

function setup() {
  const onCreate = vi.fn();
  render(<QuickAdd status="todo" label="待處理" today={TODAY} onCreate={onCreate} />);
  const input = screen.getByPlaceholderText('快速新增…試試「!高 #前端 明天」') as HTMLInputElement;
  return { onCreate, input };
}

describe('QuickAdd', () => {
  it('previews the parsed chips and creates the task on Enter, then clears', () => {
    const { onCreate, input } = setup();

    fireEvent.change(input, { target: { value: '修 bug !高 #前端 明天' } });
    expect(screen.getByText('優先級 高')).toBeTruthy();
    expect(screen.getByText('#前端')).toBeTruthy();
    expect(screen.getByText('明天 · 11月24日')).toBeTruthy();
    expect(screen.getByText('↵ 新增')).toBeTruthy();

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCreate).toHaveBeenCalledWith({
      title: '修 bug',
      priority: 1,
      tags: ['前端'],
      dueDate: '2026-11-24',
      status: 'todo',
    });
    expect(input.value).toBe('');
    expect(screen.queryByText('↵ 新增')).toBeNull();
  });

  it('does nothing on Enter when the title is empty', () => {
    const { onCreate, input } = setup();

    fireEvent.change(input, { target: { value: '!高' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onCreate).not.toHaveBeenCalled();
    expect(input.value).toBe('!高');
  });

  it('ignores the Enter that confirms an IME composition', () => {
    const { onCreate, input } = setup();

    fireEvent.change(input, { target: { value: '修 bug' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });

    expect(onCreate).not.toHaveBeenCalled();
  });

  it('Esc clears the input', () => {
    const { input } = setup();

    fireEvent.change(input, { target: { value: '修 bug #前端' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(input.value).toBe('');
  });
});
