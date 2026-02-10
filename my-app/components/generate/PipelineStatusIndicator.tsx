"use client";

import { motion } from "framer-motion";
import type { PipelineStage } from "../../store/useGenerationStore";

const STAGE_ORDER: PipelineStage[] = [
  "validating",
  "generating_prompt",
  "generating_image",
  "finalizing",
  "completed",
];

const STAGE_LABELS: Record<PipelineStage, string> = {
  idle: "대기",
  validating: "입력 검증",
  generating_prompt: "프롬프트 생성",
  generating_image: "이미지 생성",
  finalizing: "결과 정리",
  completed: "완료",
  failed: "실패",
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
  generating_prompt: {
    ring: "border-indigo-200 border-t-indigo-500",
    text: "text-indigo-700",
    badge: "bg-indigo-500 text-white",
    spinnerDuration: 0.95,
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
}

export function PipelineStatusIndicator({ stage, message, error, progress }: PipelineStatusIndicatorProps) {
  const currentIndex = STAGE_ORDER.indexOf(stage);
  const isCompleted = stage === "completed";
  const isFailed = stage === "failed";
  const theme = STAGE_THEME[stage];

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-5 rounded-2xl bg-white/78 px-6 py-8 text-center backdrop-blur-sm">
      <div className="relative flex items-center justify-center">
        {isCompleted ? (
          <motion.div
            initial={{ scale: 0.78, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 16 }}
            className="relative"
          >
            <motion.div
              className="h-20 w-20 rounded-full border-4 border-emerald-200 bg-emerald-50"
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.2 }}
            />
            <motion.svg
              viewBox="0 0 24 24"
              className="absolute inset-0 m-auto h-10 w-10 text-emerald-600"
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
            <motion.div className="h-20 w-20 rounded-full border-4 border-slate-200" />
            <motion.div
              className={`absolute h-20 w-20 rounded-full border-4 border-transparent ${theme.ring}`}
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: theme.spinnerDuration, ease: "linear" }}
            />
          </>
        )}
      </div>

      <div className="space-y-1">
        <p className={`text-sm font-semibold ${theme.text}`}>{message}</p>
        <p className="text-xs text-gray-600">
          현재 단계: {STAGE_LABELS[stage]}
        </p>
        {!isFailed ? <p className="text-[11px] text-gray-500">진행률 {Math.max(0, Math.min(100, progress))}%</p> : null}
        {error ? <p className="text-xs text-rose-600">{error}</p> : null}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        {STAGE_ORDER.map((value, index) => {
          const isDone = currentIndex >= 0 && index < currentIndex;
          const isActive = value === stage;
          const className = isActive
            ? STAGE_THEME[value].badge
            : isDone
              ? "bg-emerald-100 text-emerald-700"
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
