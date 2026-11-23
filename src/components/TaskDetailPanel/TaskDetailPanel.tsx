'use client';
// Task detail panel (spec §9 「詳情欄」), for editing (`?task=<id>`) and creating (`?task=new`).
// TaskDetailDock decides where it is shown (right column / bottom Drawer); this file is the shell:
// - Header: status segmented buttons (待處理 / 進行中 / 已完成), 刪除 (edit only), 關閉. While the task
//   is blocked (taskQueries.openBlockers) 進行中 and 已完成 are disabled with the tooltip
//   「等待前置任務：<名稱、名稱>」.
// - Title (16px, no newlines) and description, then TaskFields (優先級, 截止日, 標籤, 前置任務,
//   建立時間) and SubtaskList.
// - Edit: title and description are local drafts sent with update(task, patch) 600 ms after typing
//   stops or on blur (useDraft) — one undo command per committed edit. An empty title is never
//   sent: 「請輸入任務名稱」 shows while it is empty and blur puts the saved title back. Every other
//   field and each subtask change is one update(). 刪除 → remove(task) and close (undo via toast).
//   An id that is not in the cache (deleted, wrong URL) → 「找不到這筆任務」 + 關閉.
// - Create (`taskId === 'new'`): same layout on a local draft (status todo, priority 2), title
//   focused. 建立, ⌘/Ctrl+Enter, or Enter in the title → create({ boardId, … }); an empty title shows
//   「請輸入任務名稱」 and creates nothing. With an open prerequisite selected only 待處理 is allowed
//   (the server would answer 409 TASK_BLOCKED). On success the URL becomes `?task=<new id>`.
// - Esc closes (also from inside inputs) unless it is closing a Select/DatePicker dropdown.
// Server refusals (409 DEPENDENCY_CYCLE, 400, …) are toasted by the API layer, which also rolls the
// optimistic change back, so the controls revert to the cached values on their own.
import { ConfigProvider, Input, Tooltip } from 'antd';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useGetTasksQuery } from '@/client/api';
import { STATUS_LABEL, useTaskCommands } from '@/client/commands';
import { IconClose, IconTrash } from '@/components/icons';
import { indexById, openBlockers } from '@/lib/taskQueries';
import type { Priority, Subtask, Task, TaskStatus } from '@/lib/types';
import { cleanTitle, DESCRIPTION_MAX, TITLE_MAX } from '@/lib/validation';
import { SubtaskList } from './SubtaskList';
import { TaskFields, type FieldPatch } from './TaskFields';
import { useDraft } from './useDraft';
import { useEscapeToClose } from './useEscapeToClose';
import styles from './TaskDetailPanel.module.scss';

export const NEW_TASK = 'new';

const STATUSES: TaskStatus[] = ['todo', 'in-progress', 'done'];
const TITLE_REQUIRED = '請輸入任務名稱';
/** Spec §9: inputs inside the panel have radius 10. */
const PANEL_THEME = { token: { borderRadius: 10 } };

export interface TaskDetailPanelProps {
  /** A task id, or 'new' for create mode. */
  taskId: string;
  /** Board a new task goes to (the current /b/[boardId], else the first board); null → none yet. */
  boardId: string | null;
  onClose: () => void;
}

export function TaskDetailPanel({ taskId, boardId, onClose }: TaskDetailPanelProps) {
  const { data: list } = useGetTasksQuery();
  const setPopupOpen = useEscapeToClose(onClose);

  let body: ReactNode;
  if (!list) {
    body = <div className={styles.loading} aria-busy="true" aria-label="載入中" />;
  } else if (taskId === NEW_TASK) {
    body = <CreateTask boardId={boardId} list={list} onClose={onClose} onPopupChange={setPopupOpen} />;
  } else {
    const task = list.find((t) => t.id === taskId);
    body = task ? (
      <EditTask task={task} list={list} onClose={onClose} onPopupChange={setPopupOpen} />
    ) : (
      <div className={styles.notFound}>
        <p className={styles.notFoundText}>找不到這筆任務</p>
        <button type="button" className={styles.button} onClick={onClose}>
          關閉
        </button>
      </div>
    );
  }

  return <ConfigProvider theme={PANEL_THEME}>{body}</ConfigProvider>;
}

interface ModeProps {
  list: Task[];
  onClose: () => void;
  onPopupChange: (key: string, open: boolean) => void;
}

function EditTask({ task, list, onClose, onPopupChange }: ModeProps & { task: Task }) {
  const cmds = useTaskCommands();
  const byId = useMemo(() => indexById(list), [list]);
  const boardTasks = useMemo(() => list.filter((t) => t.boardId === task.boardId), [list, task.boardId]);

  const title = useDraft(task.title, (value) => {
    const next = cleanTitle(value);
    if (next && next !== task.title) void cmds.update(task, { title: next });
  });
  const description = useDraft(task.description ?? '', (value) => {
    const next = value.trim();
    if (next !== (task.description ?? '')) void cmds.update(task, { description: next });
  });

  function blurTitle() {
    title.onBlur();
    title.setValue(cleanTitle(title.value) || task.title);
  }

  const patch = (p: FieldPatch | { subtasks: Subtask[] }) => void cmds.update(task, p);

  return (
    <PanelLayout
      label="任務詳情"
      status={task.status}
      blockers={openBlockers(task, byId)}
      onStatus={(status) => {
        if (status !== task.status) void cmds.update(task, { status });
      }}
      actions={
        <button
          type="button"
          className={`${styles.button} ${styles.danger}`}
          onClick={() => {
            void cmds.remove(task);
            onClose();
          }}
        >
          <IconTrash size={15} />
          刪除
        </button>
      }
      onClose={onClose}
      title={
        <TitleInput
          value={title.value}
          error={!cleanTitle(title.value)}
          onChange={title.onChange}
          onFocus={title.onFocus}
          onBlur={blurTitle}
          onEnter={(el) => el.blur()}
        />
      }
      description={
        <DescriptionInput
          value={description.value}
          onChange={description.onChange}
          onFocus={description.onFocus}
          onBlur={() => {
            description.onBlur();
            description.setValue(description.value.trim());
          }}
        />
      }
    >
      <TaskFields
        selfId={task.id}
        priority={task.priority}
        dueDate={task.dueDate}
        tags={task.tags}
        dependsOn={task.dependsOn}
        boardTasks={boardTasks}
        createdAt={task.createdAt}
        onChange={patch}
        onPopupChange={onPopupChange}
      />
      <SubtaskList subtasks={task.subtasks} onChange={(subtasks) => patch({ subtasks })} />
    </PanelLayout>
  );
}

interface Draft {
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  dueDate: string | null;
  tags: string[];
  dependsOn: string[];
  subtasks: Subtask[];
}

const EMPTY_DRAFT: Draft = {
  title: '',
  description: '',
  status: 'todo',
  priority: 2,
  dueDate: null,
  tags: [],
  dependsOn: [],
  subtasks: [],
};

function CreateTask({ boardId, list, onClose, onPopupChange }: ModeProps & { boardId: string | null }) {
  const router = useRouter();
  const cmds = useTaskCommands();
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const byId = useMemo(() => indexById(list), [list]);
  const boardTasks = useMemo(() => list.filter((t) => t.boardId === boardId), [list, boardId]);
  const blockers = openBlockers({ status: 'todo', dependsOn: draft.dependsOn }, byId);

  const set = (patch: Partial<Draft>) =>
    setDraft((d) => {
      const next = { ...d, ...patch };
      // A new task with an open prerequisite can only start in 待處理.
      return openBlockers({ status: 'todo', dependsOn: next.dependsOn }, byId).length > 0
        ? { ...next, status: 'todo' }
        : next;
    });

  async function submit() {
    setTried(true);
    const title = cleanTitle(draft.title);
    if (!title || !boardId || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    const { description, ...rest } = draft;
    const created = await cmds.create({
      ...rest,
      boardId,
      title,
      ...(description.trim() && { description: description.trim() }),
    });
    inFlight.current = false;
    setSaving(false);
    if (created) router.replace(`?task=${created.id}`, { scroll: false });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <PanelLayout
      label="新增任務"
      status={draft.status}
      blockers={blockers}
      onStatus={(status) => set({ status })}
      onClose={onClose}
      onKeyDown={onKeyDown}
      title={
        <TitleInput
          value={draft.title}
          error={tried && !cleanTitle(draft.title)}
          autoFocus
          onChange={(title) => set({ title })}
          onEnter={() => void submit()}
        />
      }
      description={
        <DescriptionInput value={draft.description} onChange={(description) => set({ description })} />
      }
      footer={
        <button
          type="button"
          className={`${styles.button} ${styles.primary}`}
          disabled={saving || !boardId}
          onClick={() => void submit()}
        >
          建立
        </button>
      }
    >
      <TaskFields
        selfId={null}
        priority={draft.priority}
        dueDate={draft.dueDate}
        tags={draft.tags}
        dependsOn={draft.dependsOn}
        boardTasks={boardTasks}
        createdAt={null}
        onChange={set}
        onPopupChange={onPopupChange}
      />
      <SubtaskList subtasks={draft.subtasks} onChange={(subtasks) => set({ subtasks })} />
    </PanelLayout>
  );
}

interface PanelLayoutProps {
  label: string;
  status: TaskStatus;
  /** Open prerequisites; non-empty → only 待處理 is allowed. */
  blockers: Task[];
  onStatus: (status: TaskStatus) => void;
  actions?: ReactNode;
  onClose: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  title: ReactNode;
  description: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

function PanelLayout(props: PanelLayoutProps) {
  const waiting = `等待前置任務：${props.blockers.map((b) => b.title).join('、')}`;
  return (
    <section className={styles.panel} aria-label={props.label} onKeyDown={props.onKeyDown}>
      <header className={styles.header}>
        <div role="group" aria-label="狀態" className={styles.segmented}>
          {STATUSES.map((s) => {
            const locked = s !== 'todo' && props.blockers.length > 0;
            // The wrapper takes the hover: a disabled button fires no mouse events.
            return (
              <Tooltip key={s} title={locked ? waiting : undefined}>
                <span className={styles.segmentWrap}>
                  <button
                    type="button"
                    className={styles.segment}
                    aria-pressed={props.status === s}
                    disabled={locked}
                    onClick={() => props.onStatus(s)}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                </span>
              </Tooltip>
            );
          })}
        </div>
        <span className={styles.spacer} />
        {props.actions}
        <button type="button" className={styles.iconButton} aria-label="關閉" onClick={props.onClose}>
          <IconClose size={16} />
        </button>
      </header>
      {props.title}
      {props.description}
      {props.children}
      {props.footer && <footer className={styles.footer}>{props.footer}</footer>}
    </section>
  );
}

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

function TitleInput(
  props: TextInputProps & { error: boolean; autoFocus?: boolean; onEnter: (el: HTMLTextAreaElement) => void },
) {
  return (
    <div className={styles.titleBlock}>
      <Input.TextArea
        className={styles.title}
        variant="borderless"
        autoSize
        aria-label="任務名稱"
        aria-invalid={props.error}
        placeholder="任務名稱"
        maxLength={TITLE_MAX}
        autoFocus={props.autoFocus}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        onFocus={props.onFocus}
        onBlur={props.onBlur}
        onKeyDown={(e) => {
          // Titles have no line breaks: Enter commits (edit) or creates (new).
          if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.metaKey || e.ctrlKey) return;
          e.preventDefault();
          props.onEnter(e.currentTarget);
        }}
      />
      {props.error && (
        <p className={styles.error} role="alert">
          {TITLE_REQUIRED}
        </p>
      )}
    </div>
  );
}

function DescriptionInput(props: TextInputProps) {
  return (
    <Input.TextArea
      className={styles.description}
      variant="filled"
      autoSize={{ minRows: 3, maxRows: 12 }}
      aria-label="描述"
      placeholder="新增描述…"
      maxLength={DESCRIPTION_MAX}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      onFocus={props.onFocus}
      onBlur={props.onBlur}
    />
  );
}
