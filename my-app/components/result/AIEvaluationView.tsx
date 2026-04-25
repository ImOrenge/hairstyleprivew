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
        bg: "bg-emerald-50",
        ring: "stroke-emerald-500",
      };
    }

    if (value >= 70) {
      return {
        text: "text-amber-600",
        bg: "bg-amber-50",
        ring: "stroke-amber-500",
      };
    }

    return {
      text: "text-rose-600",
      bg: "bg-rose-50",
      ring: "stroke-rose-500",
    };
  };

  const colors = getScoreColors(score);
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="group w-full max-w-2xl overflow-hidden rounded-[2.5rem] border border-stone-200 bg-white shadow-[0_32px_64px_-16px_rgba(0,0,0,0.08)] transition-all hover:shadow-[0_48px_80px_-24px_rgba(0,0,0,0.12)]"
    >
      <div className="relative flex flex-col gap-8 p-8 sm:p-10">
        <div className={`absolute -right-20 -top-20 h-64 w-64 rounded-full ${colors.bg} opacity-20 blur-3xl`} />

        <header className="relative flex flex-col-reverse items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div className="space-y-2">
            <motion.p
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400"
            >
              {t("result.evaluation.title")}
            </motion.p>
            <motion.h2
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
              className="text-2xl font-extrabold tracking-tight text-stone-900"
            >
              {t("result.evaluation.comment")}
            </motion.h2>
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
                transition={{ duration: 1.5, ease: "easeOut", delay: 0.5 }}
                className={colors.ring}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-2xl font-black ${colors.text}`}>{score}</span>
              <span className="text-[10px] font-bold text-stone-400 uppercase">{t("result.evaluation.score")}</span>
            </div>
          </div>
        </header>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="relative"
        >
          <span className="absolute -left-4 -top-2 font-serif text-6xl text-stone-100">&ldquo;</span>
          <div className="relative space-y-2">
            <p className="text-xl font-medium leading-relaxed italic text-stone-800">
              {translate(comment) || comment}
            </p>
            {hasTranslated(comment) ? (
              <p className="text-sm leading-6 text-stone-500">{comment}</p>
            ) : null}
          </div>
        </motion.div>

        <div className="h-px w-full bg-gradient-to-r from-transparent via-stone-200 to-transparent" />

        <div className="space-y-6">
          <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-stone-500">
            <span className="h-1.5 w-1.5 rounded-full bg-stone-900" />
            {t("result.evaluation.tips")}
          </h3>
          <ul className="grid gap-4 sm:grid-cols-2">
            {tips.map((tip, index) => (
              <motion.li
                key={`${tip}-${index}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 + index * 0.1 }}
                className="group/item relative flex items-start gap-4 rounded-2xl border border-stone-100 bg-stone-50/50 p-4 transition-all hover:bg-white hover:shadow-lg hover:shadow-stone-200/50"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-stone-900 text-[10px] font-bold text-white transition-transform group-hover/item:scale-110">
                  {index + 1}
                </span>
                <div className="space-y-1">
                  <p className="text-sm font-medium leading-snug text-stone-600 transition-colors group-hover/item:text-stone-900">
                    {translate(tip) || tip}
                  </p>
                  {hasTranslated(tip) ? (
                    <p className="text-xs leading-5 text-stone-400">{tip}</p>
                  ) : null}
                </div>
              </motion.li>
            ))}
          </ul>
        </div>
      </div>
    </motion.div>
  );
}
