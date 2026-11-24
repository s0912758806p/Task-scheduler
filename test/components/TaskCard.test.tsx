// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TaskCard } from '@/components/TaskCard/TaskCard';
import { indexById, openBlockers } from '@/lib/taskQueries';
import type { Task } from '@/lib/types';
import { sampleTasksAsTasks, TODAY } from '../fixtures/tasks';

const tasks = sampleTasksAsTasks();
const byId = indexById(tasks);
const byTitle = (title: string) => tasks.find((t) => t.title === title)!;

function renderCard(task: Task, over: Partial<Parameters<typeof TaskCard>[0]> = {}) {
  const blockers = openBlockers(task, byId);
  const props = {
    task,
    blocked: blockers.length > 0,
    blockers,
    today: TODAY,
    selected: false,
    batchMode: false,
    checked: false,
    onOpen: vi.fn(),
    onAdvance: vi.fn(),
    onToggleCheck: vi.fn(),
    ...over,
  };
  render(<TaskCard {...props} />);
  return props;
}

afterEach(cleanup);

describe('TaskCard', () => {
  it('an overdue card says 「逾期 1 天」 and offers 開始處理', () => {
    const task = byTitle('完成專案需求分析'); // todo, urgent, due yesterday
    const props = renderCard(task);

    expect(screen.getByText('逾期 1 天')).toBeTruthy();
    expect(screen.getByText('緊急')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '開始處理：完成專案需求分析' }));
    expect(props.onAdvance).toHaveBeenCalledWith(task);
  });

  it('a blocked card has no → button and says 「等待 1 個前置任務」', () => {
    renderCard(byTitle('建立 CI/CD 流程')); // depends on the open 撰寫 API 規格文件

    expect(screen.getByText('等待 1 個前置任務')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /開始處理/ })).toBeNull();
  });

  it('a done card strikes the title through and its meta is only 「完成於 11月20日」', () => {
    renderCard(byTitle('建立前端框架')); // done 3 days ago, tagged #前端

    const title = screen.getByRole('button', { name: '建立前端框架' });
    expect(title.className).toMatch(/titleDone/); // .titleDone: text-3 + line-through
    expect(screen.getByText('完成於 11月20日')).toBeTruthy();
    expect(screen.queryByText('#前端')).toBeNull();
    expect(screen.getByRole('button', { name: '重新開啟：建立前端框架' })).toBeTruthy();
  });

  it('a medium-priority card shows only the dot, no text label', () => {
    renderCard(byTitle('UI 元件庫建置')); // in-progress, priority 中

    expect(screen.queryByText('中')).toBeNull();
    expect(screen.getByRole('img', { name: '優先級 中' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '標記完成：UI 元件庫建置' })).toBeTruthy();
  });

  it('clicking the title opens the task; in batch mode it toggles the check instead', () => {
    const task = byTitle('撰寫 API 規格文件');
    const props = renderCard(task);
    fireEvent.click(screen.getByRole('button', { name: '撰寫 API 規格文件' }));
    expect(props.onOpen).toHaveBeenCalledWith(task);
    cleanup();

    const batch = renderCard(task, { batchMode: true, checked: true });
    expect((screen.getByRole('checkbox', { name: '選取：撰寫 API 規格文件' }) as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByRole('button', { name: /開始處理/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '撰寫 API 規格文件' }));
    expect(batch.onToggleCheck).toHaveBeenCalledWith(task);
    expect(batch.onOpen).not.toHaveBeenCalled();
  });
});
