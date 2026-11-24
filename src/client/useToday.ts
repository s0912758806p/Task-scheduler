"use client";
// useToday(): today's local calendar day (YYYY-MM-DD) that rolls over by itself. A timer is armed for
// the next local midnight (and re-armed after it fires); returning to a visible tab re-reads the day
// and re-arms too, because timers in a sleeping or background tab can fire late or not at all.
import { useEffect, useState } from "react";
import { todayISO } from "@/lib/dates";

export function useToday(): string {
  const [today, setToday] = useState(todayISO);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(timer);
      const now = new Date();
      const midnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
      );
      timer = setTimeout(
        () => {
          setToday(todayISO());
          arm();
        },
        midnight.getTime() - now.getTime() + 50,
      );
    };
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      setToday(todayISO());
      arm();
    };
    arm();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return today;
}
