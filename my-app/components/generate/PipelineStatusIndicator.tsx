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
    accent: string;
    text: string;
  }
> = {
  idle: {
    accent: "text-[var(--app-subtle)]",
    text: "text-[var(--app-muted)]",
  },
  validating: {
    accent: "text-[var(--app-accent-strong)]",
    text: "text-[var(--app-text)]",
  },
  analyzing_face: {
    accent: "text-[var(--app-accent-strong)]",
    text: "text-[var(--app-text)]",
  },
  building_grid: {
    accent: "text-[var(--app-accent-strong)]",
    text: "text-[var(--app-text)]",
  },
  generating_image: {
    accent: "text-[var(--app-accent-strong)]",
    text: "text-[var(--app-text)]",
  },
  finalizing: {
    accent: "text-[var(--app-accent-strong)]",
    text: "text-[var(--app-text)]",
  },
  completed: {
    accent: "text-emerald-500",
    text: "text-emerald-700 dark:text-emerald-300",
  },
  failed: {
    accent: "text-rose-500",
    text: "text-rose-700 dark:text-rose-300",
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
  const circleSize = isOverlay ? "h-16 w-16" : "h-24 w-24";
  const iconSize = isOverlay ? "h-7 w-7" : "h-10 w-10";
  const normalizedProgress = Math.max(0, Math.min(100, progress));
  const displayProgress = isCompleted ? 100 : stage === "idle" ? 0 : Math.round(normalizedProgress);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const strokeOffset = circumference * (1 - displayProgress / 100);
  const trackClassName = isOverlay ? "text-white/20" : "text-[var(--app-border)]";
  const progressClassName = isOverlay && !isCompleted && !isFailed ? "text-white" : theme.accent;
  const containerClassName = isOverlay
    ? "w-full rounded-[var(--app-radius-panel)] border border-white/15 bg-black/70 px-4 py-4 text-left text-white shadow-[0_18px_60px_-30px_rgba(0,0,0,0.7)] backdrop-blur-md"
    : "flex h-full w-full flex-col items-center justify-center gap-5 rounded-[var(--app-radius-panel)] border border-[var(--app-border)] bg-[var(--app-surface)] px-6 py-8 text-center";

  return (
    <div className={cn(containerClassName, className)}>
      <div className={cn("flex gap-4", isOverlay ? "items-start" : "flex-col items-center justify-center gap-5")}>
        <motion.div
          className="relative flex shrink-0 items-center justify-center"
          initial={{ scale: 0.96, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          <svg aria-hidden="true" viewBox="0 0 100 100" className={cn(circleSize, "-rotate-90")}>
            <circle
              className={trackClassName}
              cx="50"
              cy="50"
              fill="none"
              r={radius}
              stroke="currentColor"
              strokeWidth="8"
            />
            <motion.circle
              className={progressClassName}
              cx="50"
              cy="50"
              fill="none"
              r={radius}
              stroke="currentColor"
              strokeDasharray={circumference}
              strokeDashoffset={strokeOffset}
              strokeLinecap="round"
              strokeWidth="8"
              initial={false}
              animate={{ strokeDashoffset: strokeOffset }}
              transition={{ duration: 0.45, ease: "easeOut" }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            {isCompleted ? (
              <motion.svg
                viewBox="0 0 24 24"
                className={cn("text-emerald-600", iconSize)}
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
            ) : isFailed ? (
              <span className={cn("font-black", isOverlay ? "text-xl text-rose-300" : "text-2xl text-rose-600")}>!</span>
            ) : (
              <span className={cn("font-black tabular-nums", isOverlay ? "text-sm text-white" : "text-lg text-[var(--app-text)]")}>
                {displayProgress}%
              </span>
            )}
          </div>
        </motion.div>

        <div className={cn("space-y-1", isOverlay ? "flex-1" : "")}>
          <p className={cn("text-sm font-semibold", isOverlay ? "text-white" : theme.text)}>{message}</p>
          <p className={cn("text-xs", isOverlay ? "text-white/70" : "text-[var(--app-muted)]")}>Current stage: {STAGE_LABELS[stage]}</p>
          {!isFailed ? (
            <p className={cn("text-[11px]", isOverlay ? "text-white/60" : "text-[var(--app-subtle)]")}>
              Progress {displayProgress}%
            </p>
          ) : null}
          {error ? <p className={cn("text-xs", isOverlay ? "text-rose-300" : "text-rose-600")}>{error}</p> : null}
        </div>
      </div>

      <div className={cn("grid grid-cols-6 gap-2", isOverlay ? "mt-4" : "w-full max-w-md")}>
        {STAGE_ORDER.map((value, index) => {
          const isDone = currentIndex >= 0 && index < currentIndex;
          const isActive = value === stage;
          const dotClassName = isActive
            ? isOverlay
              ? "bg-white text-black"
              : "bg-[var(--app-inverse)]"
            : isDone
              ? "bg-emerald-500"
              : isOverlay
                ? "bg-white/25"
                : "bg-[var(--app-border)]";

          return (
            <div key={value} className="flex min-w-0 flex-col items-center gap-1">
              <span className={cn("h-2.5 w-2.5 rounded-full transition", dotClassName)} />
              <span className={cn("w-full truncate text-center text-[10px] leading-3", isOverlay ? "text-white/65" : "text-[var(--app-muted)]")}>
                {STAGE_LABELS[value]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
