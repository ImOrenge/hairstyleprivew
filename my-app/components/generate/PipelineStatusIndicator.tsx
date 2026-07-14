"use client";

import { motion, useReducedMotion } from "framer-motion";
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
  const shouldReduceMotion = useReducedMotion();
  const currentIndex = STAGE_ORDER.indexOf(stage);
  const isCompleted = stage === "completed";
  const isFailed = stage === "failed";
  const isRunning = stage !== "idle" && !isCompleted && !isFailed;
  const theme = STAGE_THEME[stage];
  const isOverlay = mode === "overlay";
  const circleSize = isOverlay ? "h-16 w-16" : "h-24 w-24";
  const iconSize = isOverlay ? "h-7 w-7" : "h-10 w-10";
  const normalizedProgress = Math.max(0, Math.min(100, progress));
  const displayProgress = isCompleted ? 100 : stage === "idle" ? 0 : Math.round(normalizedProgress);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const strokeOffset = circumference * (1 - displayProgress / 100);
  const activityDashArray = `${circumference * 0.2} ${circumference}`;
  const trackClassName = isOverlay ? "text-white/20" : "text-[var(--app-border)]";
  const progressClassName = isOverlay && !isCompleted && !isFailed ? "text-white" : theme.accent;
  const containerClassName = isOverlay
    ? "w-full rounded-[var(--app-radius-panel)] border border-white/15 bg-black/70 px-4 py-4 text-left text-white shadow-[0_18px_60px_-30px_rgba(0,0,0,0.7)] backdrop-blur-md"
    : "flex h-full w-full flex-col items-center justify-center gap-5 rounded-[var(--app-radius-panel)] border border-[var(--app-border)] bg-[var(--app-surface)] px-6 py-8 text-center";

  return (
    <div
      className={cn(containerClassName, className)}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className={cn("flex gap-4", isOverlay ? "items-start" : "flex-col items-center justify-center gap-5")}>
        <motion.div
          className="relative flex shrink-0 items-center justify-center"
          initial={{ scale: 0.96, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          {isRunning ? (
            <motion.span
              aria-hidden="true"
              className={cn(
                "absolute rounded-full",
                isOverlay ? "h-12 w-12 bg-white/15" : "h-16 w-16 bg-[var(--app-accent-soft)]",
              )}
              animate={
                shouldReduceMotion
                  ? undefined
                  : {
                      opacity: [0.45, 0.16, 0.45],
                      scale: [0.82, 1.08, 0.82],
                    }
              }
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            />
          ) : null}
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
            {isRunning ? (
              <motion.circle
                className={progressClassName}
                cx="50"
                cy="50"
                fill="none"
                r={radius}
                stroke="currentColor"
                strokeDasharray={activityDashArray}
                strokeLinecap="round"
                strokeWidth="8"
                opacity="0.82"
                style={{ transformBox: "fill-box", transformOrigin: "50% 50%" }}
                animate={shouldReduceMotion ? undefined : { rotate: 360 }}
                transition={{ duration: 1.15, repeat: Infinity, ease: "linear" }}
              />
            ) : null}
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
              <motion.span
                className={cn("font-black tabular-nums", isOverlay ? "text-sm text-white" : "text-lg text-[var(--app-text)]")}
                animate={isRunning && !shouldReduceMotion ? { scale: [1, 1.05, 1] } : undefined}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
              >
                {displayProgress}%
              </motion.span>
            )}
          </div>
        </motion.div>

        <div className={cn("space-y-1", isOverlay ? "flex-1" : "")}>
          <p className={cn("text-sm font-semibold", isOverlay ? "text-white" : theme.text)}>{message}</p>
          <div className={cn("flex flex-wrap items-center gap-2 text-xs", isOverlay ? "text-white/70" : "text-[var(--app-muted)]")}>
            <span>Current stage: {STAGE_LABELS[stage]}</span>
            {isRunning ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]",
                  isOverlay ? "bg-white/15 text-white" : "bg-[var(--app-surface-muted)] text-[var(--app-accent-strong)]",
                )}
              >
                Processing
                <span className="inline-flex w-4 justify-between">
                  {[0, 1, 2].map((index) => (
                    <motion.span
                      key={index}
                      aria-hidden="true"
                      animate={shouldReduceMotion ? undefined : { opacity: [0.25, 1, 0.25] }}
                      transition={{ duration: 1, repeat: Infinity, delay: index * 0.16, ease: "easeInOut" }}
                    >
                      .
                    </motion.span>
                  ))}
                </span>
              </span>
            ) : null}
          </div>
          {!isFailed ? (
            <div
              role="progressbar"
              aria-label="헤어스타일 생성 진행률"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={displayProgress}
              aria-valuetext={`${STAGE_LABELS[stage]} ${displayProgress}%`}
              className={cn(
                "relative mt-2 h-1.5 overflow-hidden rounded-full",
                isOverlay ? "bg-white/15" : "bg-[var(--app-border)]",
              )}
            >
              <motion.div
                className={cn(
                  "absolute inset-y-0 left-0 rounded-full",
                  isOverlay ? "bg-white" : "bg-[var(--app-accent-strong)]",
                )}
                initial={false}
                animate={{ width: `${displayProgress}%` }}
                transition={{ duration: 0.45, ease: "easeOut" }}
              />
              {isRunning ? (
                <motion.span
                  aria-hidden="true"
                  className="absolute inset-y-0 w-1/3 rounded-full bg-gradient-to-r from-transparent via-white/70 to-transparent"
                  animate={shouldReduceMotion ? undefined : { x: ["-120%", "320%"] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                />
              ) : null}
            </div>
          ) : null}
          {!isFailed ? (
            <p className={cn("text-[11px]", isOverlay ? "text-white/60" : "text-[var(--app-subtle)]")}>
              Progress {displayProgress}%
            </p>
          ) : null}
          {error ? <p role="alert" className={cn("text-xs", isOverlay ? "text-rose-300" : "text-rose-600")}>{error}</p> : null}
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
              <motion.span
                className={cn("h-2.5 w-2.5 rounded-full transition", dotClassName)}
                animate={
                  isActive && isRunning && !shouldReduceMotion
                    ? {
                        opacity: [1, 0.55, 1],
                        scale: [1, 1.35, 1],
                      }
                    : undefined
                }
                transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
              />
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
