"use client";

import { useEffect, useState } from "react";
import { CONSULTATION_TASK_MESSAGES, type ConsultationActiveTask } from "../../../lib/consulting/contracts";

export function ConsultantSmallTalkCarousel({ task, paused, suppress }: {
  task: ConsultationActiveTask;
  paused: boolean;
  suppress: boolean;
}) {
  const messages = CONSULTATION_TASK_MESSAGES[task.kind];
  const initialIndex = task.id.length % messages.length;
  const [cursor, setCursor] = useState(() => ({ taskId: task.id, index: initialIndex }));
  const index = cursor.taskId === task.id ? cursor.index : initialIndex;
  const storageKey = `hairfit:consultant-messages:v1:${task.id}`;
  useEffect(() => {
    const stored = Number(window.sessionStorage.getItem(storageKey));
    if (!Number.isInteger(stored) || stored < 0) return;
    const timer = window.setTimeout(() => setCursor({ taskId: task.id, index: Math.min(stored + 1, messages.length - 1) }), 0);
    return () => window.clearTimeout(timer);
  }, [messages.length, storageKey, task.id]);
  useEffect(() => {
    window.sessionStorage.setItem(storageKey, String(index));
  }, [index, storageKey]);
  useEffect(() => {
    if (paused || suppress || task.status === "failed" || task.status === "complete" || task.status === "cancelled") return;
    const timer = window.setInterval(() => setCursor((current) => {
      const currentIndex = current.taskId === task.id ? current.index : initialIndex;
      return { taskId: task.id, index: Math.min(currentIndex + 1, messages.length - 1) };
    }), 3_200);
    return () => window.clearInterval(timer);
  }, [initialIndex, messages.length, paused, suppress, task.id, task.status]);
  if (suppress) return null;
  return <div className="f-consultant-activity__smalltalk" aria-live="off" data-paused={paused ? "true" : "false"}>
    <p className="app-kicker">Consultant note</p>
    <p>{messages[index]}</p>
  </div>;
}
