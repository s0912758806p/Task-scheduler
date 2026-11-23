// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { Provider } from "react-redux";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeStore } from "@/client/store";
import { createToaster, UndoProvider } from "@/client/undo";
import { FocusView } from "@/components/FocusView/FocusView";
import type { Board, Task } from "@/lib/types";
import { stubBrowserApis } from "../helpers/dom";
import { installFetch, jsonResponse, route } from "../helpers/fetch";
import { BOARD_ID, sampleTasksAsTasks, TODAY } from "../fixtures/tasks";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/focus",
}));

const boards: Board[] = [
  {
    id: BOARD_ID,
    name: "我的看板",
    position: 1024,
    createdAt: "2026-11-01T00:00:00.000Z",
    openCount: 8,
  },
  {
    id: "board-2",
    name: "第二個看板",
    position: 2048,
    createdAt: "2026-11-01T00:00:00.000Z",
    openCount: 0,
  },
];

let tasks: Task[];
let sent: { route: string; body: unknown }[];
let failTasks: boolean;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 23, 12, 0, 0)); // 2026-11-23 (Monday), noon
  stubBrowserApis();
  push.mockReset();
  tasks = sampleTasksAsTasks(TODAY);
  sent = [];
  failTasks = false;
  installFetch(async (req) => {
    const r = route(req);
    if (r === "GET /api/boards") return jsonResponse(boards);
    if (r === "GET /api/tasks") {
      return failTasks
        ? jsonResponse({ error: { code: "X", message: "x" } }, 500)
        : jsonResponse(tasks);
    }
    sent.push({ route: r, body: await req.json() });
    return jsonResponse({ ...tasks[0], status: "done" });
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderFocus() {
  const toaster = createToaster();
  const store = makeStore({ toast: toaster.show });
  render(
    <Provider store={store}>
      <UndoProvider toaster={toaster}>
        <FocusView />
      </UndoProvider>
    </Provider>,
  );
}

const group = (name: string) => screen.getByRole("region", { name });
const titlesIn = (name: string) =>
  within(group(name))
    .queryAllByRole("listitem")
    .map(
      (li) =>
        within(li).getAllByRole("button")[1]?.textContent ??
        within(li).getAllByRole("button")[0].textContent,
    );

describe("FocusView", () => {
  it("shows the header, subtitle and the four groups", async () => {
    renderFocus();
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "今天有 3 件事需要你",
      }),
    ).toBeTruthy();
    expect(screen.getByText("11月23日 星期一")).toBeTruthy();
    expect(
      screen.getByText("2 件已逾期、1 件今天到期 · 橫跨 1 個看板"),
    ).toBeTruthy();
    expect(titlesIn("已逾期")).toEqual([
      "實作使用者認證模組",
      "完成專案需求分析",
    ]);
    expect(titlesIn("今天到期")).toEqual(["安全性稽核"]);
    expect(
      within(group("等待前置任務")).getByText("建立 CI/CD 流程"),
    ).toBeTruthy();
    expect(
      within(group("接下來 7 天")).getByText("撰寫 API 規格文件"),
    ).toBeTruthy();
  });

  it("a blocked row has a lock instead of a completion circle", async () => {
    renderFocus();
    await screen.findByText("建立 CI/CD 流程");
    expect(
      screen.queryByRole("button", { name: "標記完成：建立 CI/CD 流程" }),
    ).toBeNull();
    expect(
      within(group("等待前置任務")).getByRole("img", { name: "等待前置任務" }),
    ).toBeTruthy();
  });

  it("shows the overdue empty text when nothing is overdue, and the quiet subtitle when nothing is urgent", async () => {
    tasks = tasks.map((t) =>
      t.dueDate !== null && t.dueDate <= TODAY
        ? { ...t, status: "done" as const }
        : t,
    );
    renderFocus();
    expect(await screen.findByText("沒有逾期的任務，做得好。")).toBeTruthy();
    expect(screen.getByText("今天沒有到期的任務。")).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 1, name: "今天有 0 件事需要你" }),
    ).toBeTruthy();
    expect(screen.getByText("今天沒有到期或逾期的任務")).toBeTruthy();
    expect(screen.queryByText(/橫跨/)).toBeNull();
  });

  it("suggests the highest-priority overdue task and opens it", async () => {
    renderFocus();
    const card = (
      await screen.findByRole("heading", { name: "建議先處理" })
    ).closest("section")!;
    expect(within(card).getByText("實作使用者認證模組")).toBeTruthy();
    fireEvent.click(within(card).getByRole("button", { name: "打開任務" }));
    expect(push).toHaveBeenCalledWith("?task=sample-7", { scroll: false });
  });

  it("clicking a title opens the detail panel via ?task=", async () => {
    renderFocus();
    fireEvent.click(
      await screen.findByRole("button", { name: "完成專案需求分析" }),
    );
    expect(push).toHaveBeenCalledWith("?task=sample-1", { scroll: false });
  });

  it("the completion circle moves the task to the top of done", async () => {
    renderFocus();
    fireEvent.click(
      await screen.findByRole("button", { name: "標記完成：完成專案需求分析" }),
    );
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].route).toBe("PATCH /api/tasks/sample-1");
    expect(sent[0].body).toMatchObject({
      status: "done",
      position: null,
      insertAfterId: null,
    });
  });

  it("shows board progress and the 7-day completed count", async () => {
    renderFocus();
    const progress = (
      await screen.findByRole("heading", { name: "看板進度" })
    ).closest("section")!;
    expect(within(progress).getByText("我的看板")).toBeTruthy();
    expect(within(progress).getByText("3 / 11")).toBeTruthy();
    expect(within(progress).getByText("0 / 0")).toBeTruthy();
    expect(
      screen.getByText("件任務在過去 7 天內完成").previousElementSibling
        ?.textContent,
    ).toBe("2");
  });

  it("shows a skeleton while loading and an error message when the first load fails", async () => {
    failTasks = true;
    renderFocus();
    expect(screen.getByLabelText("載入中")).toBeTruthy();
    expect(
      await screen.findByText("無法載入資料，請重新整理頁面再試一次。"),
    ).toBeTruthy();
  });
});
