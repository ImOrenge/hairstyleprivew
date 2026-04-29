"use client";

import { Camera, CheckCircle2, Grid3X3, Shirt } from "lucide-react";
import { useT } from "../../lib/i18n/useT";
import { Panel, SurfaceCard } from "../ui/Surface";

export function FeatureShowcase() {
  const t = useT();

  const features = [
    {
      title: t("features.1.title"),
      description: t("features.1.desc"),
      point: t("features.1.point"),
      icon: Camera,
    },
    {
      title: t("features.2.title"),
      description: t("features.2.desc"),
      point: t("features.2.point"),
      icon: Grid3X3,
    },
    {
      title: t("features.3.title"),
      description: t("features.3.desc"),
      point: t("features.3.point"),
      icon: CheckCircle2,
    },
    {
      title: t("features.4.title"),
      description: t("features.4.desc"),
      point: t("features.4.point"),
      icon: Shirt,
    },
  ];

  return (
    <Panel as="section" className="p-5 transition-colors sm:p-6">
      <div className="flex flex-col gap-2">
        <p className="app-kicker">{t("features.badge")}</p>
        <h2 className="text-2xl font-black tracking-tight text-[var(--app-text)] sm:text-3xl">
          {t("features.title")}
        </h2>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4 max-md:max-h-[30rem] max-md:overflow-y-auto max-md:snap-y max-md:snap-mandatory max-md:overscroll-contain max-md:pr-1">
        {features.map((feature, index) => {
          const Icon = feature.icon;
          return (
            <SurfaceCard
              as="article"
              key={feature.title}
              className="group flex min-h-64 flex-col p-4 transition duration-300 hover:-translate-y-0.5 hover:border-[var(--app-accent)] max-md:min-h-[18rem] max-md:snap-start"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-[var(--app-radius-control)] bg-[var(--app-inverse)] text-[var(--app-inverse-text)]">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="text-xs font-black uppercase tracking-[0.18em] text-[var(--app-border)]">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>
              <h3 className="mt-5 text-lg font-bold text-[var(--app-text)]">{feature.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-6 text-[var(--app-muted)]">{feature.description}</p>
              <p className="mt-5 border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-xs font-semibold text-[var(--app-text)]">
                {feature.point}
              </p>
            </SurfaceCard>
          );
        })}
      </div>
    </Panel>
  );
}
