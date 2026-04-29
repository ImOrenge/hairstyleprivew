"use client";

import { motion } from "framer-motion";
import { useT } from "../../lib/i18n/useT";
import { type AIEvaluationResult } from "../../lib/ai-evaluation";
import { useResultTranslations } from "../../hooks/useResultTranslations";

interface AIEvaluationViewProps {
  evaluation: AIEvaluationResult;
}

export function AIEvaluationView({ evaluation }: AIEvaluationViewProps) {
  const t = useT();
  const { score, comment, tips } = evaluation;
  const { translate, hasTranslated } = useResultTranslations([comment, ...tips]);

  const getScoreColors = (value: number) => {
    if (value >= 85) {
      return {
        text: "text-emerald-600",
        ring: "stroke-emerald-500",
      };
    }

    if (value >= 70) {
      return {
        text: "text-amber-600",
        ring: "stroke-amber-500",
      };
    }

    return {
      text: "text-rose-600",
      ring: "stroke-rose-500",
    };
  };

  const colors = getScoreColors(score);
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className="app-card w-full overflow-hidden shadow-[0_18px_50px_-36px_rgba(15,23,42,0.35)]"
    >
      <div className="flex flex-col gap-5 p-5 sm:p-6">
        <header className="flex items-start justify-between gap-5">
          <div className="min-w-0 space-y-2">
            <p className="app-kicker text-[10px]">
              {t("result.evaluation.title")}
            </p>
            <h2 className="text-xl font-extrabold tracking-normal text-[var(--app-text)] sm:text-2xl">
              {t("result.evaluation.comment")}
            </h2>
          </div>

          <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
            <svg className="h-full w-full -rotate-90 transform">
              <circle
                cx="48"
                cy="48"
                r={radius}
                stroke="currentColor"
                strokeWidth="8"
                fill="transparent"
                className="text-stone-100"
              />
              <motion.circle
                cx="48"
                cy="48"
                r={radius}
                stroke="currentColor"
                strokeWidth="8"
                fill="transparent"
                strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset: offset }}
                transition={{ duration: 1.2, ease: "easeOut", delay: 0.2 }}
                className={colors.ring}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-2xl font-black ${colors.text}`}>{score}</span>
              <span className="text-[10px] font-bold uppercase text-[var(--app-muted)]">{t("result.evaluation.score")}</span>
            </div>
          </div>
        </header>

        <div className="space-y-2">
          <p className="text-base font-medium leading-7 text-[var(--app-text)] sm:text-lg">
            {translate(comment) || comment}
          </p>
          {hasTranslated(comment) ? (
            <p className="text-sm leading-6 text-[var(--app-muted)]">{comment}</p>
          ) : null}
        </div>

        <div className="h-px w-full bg-[var(--app-border)]" />

        <div className="space-y-4">
          <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--app-muted)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--app-inverse)]" />
            {t("result.evaluation.tips")}
          </h3>
          <ul className="grid gap-3 sm:grid-cols-2">
            {tips.map((tip, index) => (
              <motion.li
                key={`${tip}-${index}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 + index * 0.08 }}
                className="app-card flex items-start gap-3 p-3 transition hover:bg-[var(--app-surface)]"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--app-radius-control)] bg-[var(--app-inverse)] text-[10px] font-bold text-[var(--app-inverse-text)]">
                  {index + 1}
                </span>
                <div className="space-y-1">
                  <p className="text-sm font-medium leading-6 text-[var(--app-text)]">
                    {translate(tip) || tip}
                  </p>
                  {hasTranslated(tip) ? (
                    <p className="text-xs leading-5 text-[var(--app-subtle)]">{tip}</p>
                  ) : null}
                </div>
              </motion.li>
            ))}
          </ul>
        </div>
      </div>
    </motion.section>
  );
}
