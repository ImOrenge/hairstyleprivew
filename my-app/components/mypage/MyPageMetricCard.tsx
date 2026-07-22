import type { LucideIcon } from "lucide-react";
import { SurfaceCard } from "../ui/Surface";

interface MyPageMetricCardProps {
  helper: string;
  icon: LucideIcon;
  label: string;
  value: string;
}

export function MyPageMetricCard({
  helper,
  icon: Icon,
  label,
  value,
}: MyPageMetricCardProps) {
  return (
    <SurfaceCard className="px-3 py-3 sm:px-5 sm:py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase text-[var(--app-muted)]">
            {label}
          </p>
          <p className="mt-2 break-words text-2xl font-black tracking-tight text-[var(--app-text)] sm:mt-3 sm:text-3xl">
            {value}
          </p>
          <p className="mt-2 text-xs leading-5 text-[var(--app-muted)] sm:text-sm">
            {helper}
          </p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--app-radius-control)] bg-[var(--app-surface)] text-[var(--app-text)] sm:h-10 sm:w-10">
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
        </span>
      </div>
    </SurfaceCard>
  );
}
