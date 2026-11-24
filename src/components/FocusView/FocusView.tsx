"use client";
// 今日焦點 page body for /focus (spec §9 「今日焦點」). Everything is derived from the cached
// getTasks + getBoards with lib/taskQueries; `today` = useToday() (rolls over at midnight).
// - Header: date line 「11月23日 星期一」, 「今天有 N 件事需要你」 (N = overdue + due today), subtitle
//   「X 件已逾期、Y 件今天到期 · 橫跨 Z 個看板」 (Z = distinct boards among those tasks); N = 0 →
//   「今天沒有到期或逾期的任務」 only.
// - Four groups (已逾期 / 今天到期 / 接下來 7 天 / 等待前置任務), each with its own empty sentence. A row:
//   completion circle (aria-label 「標記完成：<標題>」 → update(task, { status: 'done' }), the same
//   status-only update as the board's 「→」: the server puts it at the top of the done column without
//   renumbering it), title button (router.push('?task=<id>', { scroll: false }) opens the detail
//   panel), priority dot, 進行中 mark, board name, relative due date. A blocked task cannot leave
//   todo, so its row shows a lock instead of the circle.
// - Right column: 建議先處理 (pickSuggestion, button 「打開任務」), 看板進度 (done / total per board,
//   non-deleted tasks), and 「過去 7 天完成」 (completedWithin).
// - Loading → skeleton; a failed first load → 「無法載入資料，請重新整理頁面再試一次。」 (as BoardView).
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { useGetBoardsQuery, useGetTasksQuery } from "@/client/api";
import { useTaskCommands } from "@/client/commands";
import { useToday } from "@/client/useToday";
import { IconCheck, IconLock } from "@/components/icons";
import { relativeDue, weekdayLabel } from "@/lib/dates";
import {
  completedWithin,
  focusGroups,
  indexById,
  isBlocked,
  pickSuggestion,
} from "@/lib/taskQueries";
import type { Task } from "@/lib/types";
import styles from "./FocusView.module.scss";

const PRIORITY_NAME = ["緊急", "高", "中", "低"];

function dateLine(today: string): string {
  const [, m, d] = today.split("-").map(Number);
  return `${m}月${d}日 星期${weekdayLabel(today).slice(1)}`;
}

export function FocusView() {
  const router = useRouter();
  const boardsQuery = useGetBoardsQuery();
  const tasksQuery = useGetTasksQuery();
  const cmds = useTaskCommands();
  const today = useToday();
  const tasks = tasksQuery.data;
  const boards = boardsQuery.data;

  const view = useMemo(() => {
    if (!tasks || !boards) return null;
    const byId = indexById(tasks);
    const groups = focusGroups(tasks, byId, today);
    const boardName = new Map(boards.map((b) => [b.id, b.name]));
    const urgent = [...groups.overdue, ...groups.today];
    const progress = boards.map((b) => {
      const mine = tasks.filter((t) => t.boardId === b.id);
      return {
        board: b,
        done: mine.filter((t) => t.status === "done").length,
        total: mine.length,
      };
    });
    return {
      byId,
      groups,
      boardName,
      urgentCount: urgent.length,
      boardCount: new Set(urgent.map((t) => t.boardId)).size,
      suggestion: pickSuggestion(groups),
      progress,
      doneWeek: completedWithin(tasks, 7, new Date()),
    };
  }, [tasks, boards, today]);

  if (!view) {
    // A failed background refetch keeps showing the cached data; only a first load can fail here.
    if (boardsQuery.isError || tasksQuery.isError) {
      return (
        <p className={styles.message}>無法載入資料，請重新整理頁面再試一次。</p>
      );
    }
    return <FocusSkeleton />;
  }

  const {
    byId,
    groups,
    boardName,
    urgentCount,
    boardCount,
    suggestion,
    progress,
    doneWeek,
  } = view;
  const open = (task: Task) =>
    router.push(`?task=${task.id}`, { scroll: false });
  const complete = (task: Task) => void cmds.update(task, { status: "done" });

  const section = (title: string, list: Task[], empty: string) => (
    <section className={styles.group} aria-label={title}>
      <h2 className={styles.groupTitle}>
        {title}
        <span className={styles.count}>{list.length}</span>
      </h2>
      {list.length === 0 ? (
        <p className={styles.empty}>{empty}</p>
      ) : (
        <ul className={styles.list}>
          {list.map((task) => (
            <li key={task.id} className={styles.row}>
              {isBlocked(task, byId) ? (
                <span
                  className={styles.lock}
                  role="img"
                  aria-label="等待前置任務"
                >
                  <IconLock size={15} />
                </span>
              ) : (
                <button
                  type="button"
                  className={styles.circle}
                  aria-label={`標記完成：${task.title}`}
                  onClick={() => complete(task)}
                >
                  <IconCheck size={12} />
                </button>
              )}
              <span
                role="img"
                aria-label={`優先級 ${PRIORITY_NAME[task.priority]}`}
                className={`${styles.dot} ${styles[`p${task.priority}`]}`}
              />
              <button
                type="button"
                className={styles.title}
                onClick={() => open(task)}
              >
                {task.title}
              </button>
              {task.status === "in-progress" && (
                <span className={styles.progressMark}>進行中</span>
              )}
              <span className={styles.board}>
                {boardName.get(task.boardId) ?? ""}
              </span>
              {task.dueDate !== null && (
                <span
                  className={
                    task.dueDate < today
                      ? styles.dueOverdue
                      : task.dueDate === today
                        ? styles.dueToday
                        : styles.due
                  }
                >
                  {relativeDue(task.dueDate, today)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.date}>{dateLine(today)}</p>
        <h1 className={styles.heading}>{`今天有 ${urgentCount} 件事需要你`}</h1>
        <p className={styles.subtitle}>
          {urgentCount === 0
            ? "今天沒有到期或逾期的任務"
            : `${groups.overdue.length} 件已逾期、${groups.today.length} 件今天到期 · 橫跨 ${boardCount} 個看板`}
        </p>
      </header>

      <div className={styles.layout}>
        <div className={styles.groups}>
          {section("已逾期", groups.overdue, "沒有逾期的任務，做得好。")}
          {section("今天到期", groups.today, "今天沒有到期的任務。")}
          {section("接下來 7 天", groups.week, "這週很清爽。")}
          {section("等待前置任務", groups.blocked, "沒有被卡住的任務。")}
        </div>

        <aside className={styles.side} aria-label="焦點摘要">
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>建議先處理</h2>
            {suggestion ? (
              <>
                <p className={styles.suggestTitle}>{suggestion.title}</p>
                <p className={styles.suggestMeta}>
                  {[
                    boardName.get(suggestion.boardId),
                    `優先級 ${PRIORITY_NAME[suggestion.priority]}`,
                    suggestion.dueDate !== null
                      ? relativeDue(suggestion.dueDate, today)
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => open(suggestion)}
                >
                  打開任務
                </button>
              </>
            ) : (
              <p className={styles.empty}>目前沒有需要優先處理的任務。</p>
            )}
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>看板進度</h2>
            <ul className={styles.progressList}>
              {progress.map(({ board, done, total }) => (
                <li key={board.id} className={styles.progressItem}>
                  <span className={styles.progressName}>{board.name}</span>
                  <span
                    className={styles.progressCount}
                  >{`${done} / ${total}`}</span>
                  <span className={styles.bar} aria-hidden="true">
                    <span
                      className={styles.barFill}
                      style={{
                        width: `${total === 0 ? 0 : Math.round((done / total) * 100)}%`,
                      }}
                    />
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className={styles.card}>
            <p className={styles.bigNumber}>{doneWeek}</p>
            <p className={styles.bigLabel}>件任務在過去 7 天內完成</p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function FocusSkeleton() {
  return (
    <div className={styles.page} aria-busy="true" aria-label="載入中">
      <div className={styles.skeletonTitle} />
      <div className={styles.layout}>
        <div className={styles.groups}>
          {[0, 1, 2].map((i) => (
            <div key={i} className={styles.skeletonBlock} />
          ))}
        </div>
        <div className={styles.side}>
          <div className={styles.skeletonBlock} />
        </div>
      </div>
    </div>
  );
}
