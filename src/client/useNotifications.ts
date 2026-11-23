'use client';
// useNotifications(): opt-in due-date reminders (spec §9 「通知」). Call it once (AppShell does) and
// share the result; the Sidebar button and the command palette both use enable().
// - Never asks for permission by itself: only enable() calls Notification.requestPermission().
//   permission is 'unsupported' when the browser has no Notification API.
// - While permission is 'granted' (and the tasks are loaded) it checks right away and then every
//   10 minutes. Due dates are plain dates: overdue = dueDate < today → 「任務已逾期」; due soon =
//   dueDate is today or tomorrow → 「任務即將到期」. Open (not done) tasks only.
// - If the Notification constructor throws (Android Chrome), checking stops for the session and
//   permission reports 'unsupported'.
// - Each task is notified once ever: ids are kept in localStorage `taskSchedulerNotifiedIds`
//   (reads/writes are try/catch'd; unreadable storage counts as empty). tag = task id, no icon.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { addDays } from '@/lib/dates';
import { useGetTasksQuery } from './api';
import { useToday } from './useToday';

export type ReminderPermission = NotificationPermission | 'unsupported';

export interface Notifications {
  permission: ReminderPermission;
  /** Asks the browser for permission (the only place that ever does). */
  enable: () => Promise<ReminderPermission>;
}

export const CHECK_INTERVAL_MS = 10 * 60 * 1000;
const NOTIFIED_KEY = 'taskSchedulerNotifiedIds';

function readNotified(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(NOTIFIED_KEY) ?? '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeNotified(ids: Set<string>) {
  try {
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...ids]));
  } catch {
    // storage unavailable: worst case a task is notified again after a reload
  }
}

const currentPermission = (): ReminderPermission =>
  typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
const subscribeNever = () => () => {};
const serverPermission = (): ReminderPermission => 'default';

export function useNotifications(): Notifications {
  const { data: tasks } = useGetTasksQuery();
  const today = useToday();
  // Notification.permission has no change event: read it per render, and remember the answer of
  // enable() so the UI updates at once.
  const browser = useSyncExternalStore(subscribeNever, currentPermission, serverPermission);
  const [answered, setAnswered] = useState<ReminderPermission | null>(null);
  const [broken, setBroken] = useState(false);
  const permission = broken ? 'unsupported' : (answered ?? browser);
  const latest = useRef({ tasks, today });
  useEffect(() => {
    latest.current = { tasks, today };
  });
  const loaded = tasks !== undefined;

  const check = useCallback(() => {
    const { tasks: list = [], today: day } = latest.current;
    const tomorrow = addDays(day, 1);
    const notified = readNotified();
    let changed = false;
    for (const t of list) {
      if (t.status === 'done' || t.dueDate === null || notified.has(t.id)) continue;
      const overdue = t.dueDate < day;
      if (!overdue && t.dueDate !== day && t.dueDate !== tomorrow) continue;
      try {
        new Notification(overdue ? '任務已逾期' : '任務即將到期', {
          body: overdue ? `「${t.title}」已超過截止日` : `「${t.title}」將在 24 小時內到期`,
          tag: t.id,
        });
      } catch {
        // e.g. Android Chrome: permission exists but the constructor throws. Stop for this session.
        if (changed) writeNotified(notified);
        setBroken(true);
        return;
      }
      notified.add(t.id);
      changed = true;
    }
    if (changed) writeNotified(notified);
  }, []);

  useEffect(() => {
    if (permission !== 'granted' || !loaded) return;
    check();
    const timer = setInterval(check, CHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [permission, loaded, check]);

  const enable = useCallback(async (): Promise<ReminderPermission> => {
    if (currentPermission() === 'unsupported') return 'unsupported';
    const result = await Notification.requestPermission();
    setAnswered(result);
    return result;
  }, []);

  return { permission, enable };
}
