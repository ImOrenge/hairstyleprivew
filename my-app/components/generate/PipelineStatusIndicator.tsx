"use client";

import { motion } from "framer-motion";
import { cn } from "../../lib/utils";
import type { PipelineStage } from "../../store/useGenerationStore";

const STAGE_ORDER: PipelineStage[] = [
  "validating",
  "analyzing_face",
  "building_grid",
  "generating_image",
  "finalizing",
  "completed",
];

const STAGE_LABELS: Record<PipelineStage, string> = {
  idle: "Idle",
  validating: "Validate Photo",
  analyzing_face: "Analyze Face",
  building_grid: "Build Grid",
  generating_image: "Render Variants",
  finalizing: "Finalize",
  completed: "Complete",
  failed: "Failed",
};

const STAGE_THEME: Record<
  PipelineStage,
  {
    ring: string;
    text: string;
    badge: string;
    spinnerDuration: number;
  }
> = {
  idle: {
    ring: "border-slate-300 border-t-slate-500",
    text: "text-slate-700",
    badge: "bg-slate-500 text-white",
    spinnerDuration: 1.2,
  },
  validating: {
    ring: "border-sky-200 border-t-sky-500",
    text: "text-sky-700",
    badge: "bg-sky-500 text-white",
    spinnerDuration: 1.1,
  },
  analyzing_face: {
    ring: "border-indigo-200 border-t-indigo-500",
    text: "text-indigo-700",
    badge: "bg-indigo-500 text-white",
    spinnerDuration: 0.95,
  },
  building_grid: {
    ring: "border-violet-200 border-t-violet-500",
    text: "text-violet-700",
    badge: "bg-violet-500 text-white",
    spinnerDuration: 0.92,
  },
  generating_image: {
    ring: "border-emerald-200 border-t-emerald-500",
    text: "text-emerald-700",
    badge: "bg-emerald-500 text-white",
    spinnerDuration: 0.8,
  },
  finalizing: {
    ring: "border-amber-200 border-t-amber-500",
    text: "text-amber-700",
    badge: "bg-amber-500 text-white",
    spinnerDuration: 1.05,
  },
  completed: {
    ring: "border-emerald-200 border-t-emerald-500",
    text: "text-emerald-700",
    badge: "bg-emerald-600 text-white",
    spinnerDuration: 1,
  },
  failed: {
    ring: "border-rose-200 border-t-rose-500",
    text: "text-rose-700",
    badge: "bg-rose-500 text-white",
    spinnerDuration: 1.2,
  },
};

interface PipelineStatusIndicatorProps {
  stage: PipelineStage;
  message: string;
  error: string | null;
  progress: number;
  mode?: "panel" | "overlay";
  className?: string;
}

export function PipelineStatusIndicator({
  stage,
  message,
  error,
  progress,
  mode = "panel",
  className,
}: PipelineStatusIndicatorProps) {
  const currentIndex = STAGE_ORDER.indexOf(stage);
  const isCompleted = stage === "completed";
  const isFailed = stage === "failed";
  const theme = STAGE_THEME[stage];
  const isOverlay = mode === "overlay";
  const spinnerSize = isOverlay ? "h-14 w-14" : "h-20 w-20";
  const iconSize = isOverlay ? "h-7 w-7" : "h-10 w-10";
  const containerClassName = isOverlay
    ? "w-full rounded-[1.5rem] border border-white/15 bg-black/70 px-4 py-4 text-left text-white shadow-[0_18px_60px_-30px_rgba(0,0,0,0.7)] backdrop-blur-md"
    : "flex h-full w-full flex-col items-center justify-center gap-5 rounded-2xl bg-white/78 px-6 py-8 text-center backdrop-blur-sm";

  return (
    <div className={cn(containerClassName, className)}>
      <div className={cn("flex gap-4", isOverlay ? "items-start" : "flex-col items-center justify-center gap-5")}>
      <div className="relative flex items-center justify-center">
        {isCompleted ? (
          <motion.div
            initial={{ scale: 0.78, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 16 }}
            className="relative"
          >
            <motion.div
              className={cn(spinnerSize, "rounded-full border-4 border-emerald-200 bg-emerald-50")}
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.2 }}
            />
            <motion.svg
              viewBox="0 0 24 24"
              className={cn("absolute inset-0 m-auto text-emerald-600", iconSize)}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <motion.path
                d="M5 12l4 4L19 7"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.35, ease: "easeOut", delay: 0.08 }}
              />
            </motion.svg>
          </motion.div>
        ) : (
          <>
            <motion.div className={cn(spinnerSize, "rounded-full border-4 border-slate-200")} />
            <motion.div
              className={cn(spinnerSize, "absolute rounded-full border-4 border-transparent", theme.ring)}
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: theme.spinnerDuration, ease: "linear" }}
            />
          </>
        )}
      </div>

      <div className={cn("space-y-1", isOverlay ? "flex-1" : "")}>
        <p className={cn("text-sm font-semibold", isOverlay ? "text-white" : theme.text)}>{message}</p>
        <p className={cn("text-xs", isOverlay ? "text-white/70" : "text-gray-600")}>Current stage: {STAGE_LABELS[stage]}</p>
        {!isFailed ? (
          <p className={cn("text-[11px]", isOverlay ? "text-white/60" : "text-gray-500")}>
            Progress {Math.max(0, Math.min(100, progress))}%
          </p>
        ) : null}
        {error ? <p className={cn("text-xs", isOverlay ? "text-rose-300" : "text-rose-600")}>{error}</p> : null}
      </div>
      </div>

      <div className={cn("flex flex-wrap gap-2", isOverlay ? "mt-4 items-center" : "items-center justify-center")}>
        {STAGE_ORDER.map((value, index) => {
          const isDone = currentIndex >= 0 && index < currentIndex;
          const isActive = value === stage;
          const className = isActive
            ? STAGE_THEME[value].badge
            : isDone
              ? "bg-emerald-100 text-emerald-700"
              : isOverlay
                ? "bg-white/10 text-white/70"
                : "bg-gray-100 text-gray-500";

          return (
            <span
              key={value}
              className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${className}`}
            >
              {STAGE_LABELS[value]}
            </span>
          );
        })}
      </div>
    </div>
  );
}
