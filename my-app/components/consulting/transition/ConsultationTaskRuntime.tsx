"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { ConsultationActiveTask } from "../../../lib/consulting/contracts";

type TaskUpdate = Partial<Omit<ConsultationActiveTask, "id" | "kind">>;

interface ConsultationTaskRuntimeValue {
  task: ConsultationActiveTask | null;
  startTask: (task: ConsultationActiveTask) => void;
  updateTask: (update: TaskUpdate) => void;
  completeTask: (update?: TaskUpdate) => void;
  failTask: (detail: string, retryable?: boolean) => void;
  clearTask: () => void;
}

const ConsultationTaskRuntimeContext = createContext<ConsultationTaskRuntimeValue | null>(null);

export function ConsultationTaskRuntimeProvider({ children }: { children: ReactNode }) {
  const [task, setTask] = useState<ConsultationActiveTask | null>(null);
  const startTask = useCallback((next: ConsultationActiveTask) => setTask(next), []);
  const updateTask = useCallback((update: TaskUpdate) => setTask((current) => current ? {
    ...current,
    ...update,
    updatedAt: new Date().toISOString(),
  } : current), []);
  const completeTask = useCallback((update: TaskUpdate = {}) => setTask((current) => current ? {
    ...current,
    ...update,
    status: "complete",
    phaseKey: "complete",
    completedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } : current), []);
  const failTask = useCallback((detail: string, retryable = true) => setTask((current) => current ? {
    ...current,
    status: "failed",
    phaseKey: "failed",
    detail,
    retryable,
    updatedAt: new Date().toISOString(),
  } : current), []);
  const clearTask = useCallback(() => setTask(null), []);
  const value = useMemo(() => ({ task, startTask, updateTask, completeTask, failTask, clearTask }), [clearTask, completeTask, failTask, startTask, task, updateTask]);
  return <ConsultationTaskRuntimeContext.Provider value={value}>{children}</ConsultationTaskRuntimeContext.Provider>;
}

export function useConsultationTaskRuntime() {
  const value = useContext(ConsultationTaskRuntimeContext);
  if (!value) throw new Error("useConsultationTaskRuntime must be used inside ConsultationTaskRuntimeProvider");
  return value;
}
