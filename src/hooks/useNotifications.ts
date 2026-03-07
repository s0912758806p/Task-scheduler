import { useEffect, useRef } from "react";
import { TaskData } from "../types/task";

// 提前提醒的時間（1天 = 86400000 ms）
const REMIND_BEFORE_MS = 86400000;
const STORAGE_KEY = "taskSchedulerNotifiedIds";

const getNotifiedIds = (): Set<string> => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? new Set(JSON.parse(saved)) : new Set();
  } catch {
    return new Set();
  }
};

const saveNotifiedIds = (ids: Set<string>) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ids)));
};

export const useNotifications = (tasks: TaskData[]) => {
  const permissionRef = useRef<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "denied"
  );

  useEffect(() => {
    if (typeof Notification === "undefined") return;

    const requestAndCheck = async () => {
      if (Notification.permission === "default") {
        const result = await Notification.requestPermission();
        permissionRef.current = result;
      }

      if (Notification.permission !== "granted") return;

      const now = Date.now();
      const notifiedIds = getNotifiedIds();
      let changed = false;

      // 清除已完成任務的通知記錄（讓它們可以重新被通知）
      for (const id of Array.from(notifiedIds)) {
        const task = tasks.find((t) => t.id === id);
        if (!task || task.status === "done") {
          notifiedIds.delete(id);
          changed = true;
        }
      }

      tasks.forEach((task) => {
        if (task.status === "done" || !task.dueDate) return;
        if (notifiedIds.has(task.id)) return;

        const timeLeft = task.dueDate - now;

        // 已逾期
        if (timeLeft < 0) {
          new Notification("任務已逾期 ⚠️", {
            body: `「${task.title}」已超過截止時間`,
            icon: "/vite.svg",
            tag: task.id,
          });
          notifiedIds.add(task.id);
          changed = true;
        }
        // 24 小時內到期
        else if (timeLeft <= REMIND_BEFORE_MS) {
          const hours = Math.ceil(timeLeft / 3600000);
          new Notification("任務即將到期 🔔", {
            body: `「${task.title}」將在 ${hours} 小時後到期`,
            icon: "/vite.svg",
            tag: task.id,
          });
          notifiedIds.add(task.id);
          changed = true;
        }
      });

      if (changed) saveNotifiedIds(notifiedIds);
    };

    requestAndCheck();
  }, [tasks]);
};
