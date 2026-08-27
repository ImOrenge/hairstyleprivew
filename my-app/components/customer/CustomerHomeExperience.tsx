"use client";

/* eslint-disable @next/next/no-img-element */
import { ArrowRight, Clock3, HeartPulse, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type {
  CustomerHomeActionIcon,
  CustomerHomeActionView,
  CustomerHomeViewModel,
} from "../../lib/customer-home-view";

const ACTION_ICONS: Record<CustomerHomeActionIcon, typeof Clock3> = {
  clock: Clock3,
  sparkles: Sparkles,
  heart: HeartPulse,
};

export function CustomerHomeExperience({ view }: { view: CustomerHomeViewModel }) {
  const [selectedId, setSelectedId] = useState(view.defaultActionId);
  const [navigatingHref, setNavigatingHref] = useState<string | null>(null);
  const actionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selected = view.actions.find((action) => action.id === selectedId) ?? view.actions[0];

  const selectAction = (action: CustomerHomeActionView) => {
    setSelectedId(action.id);
    setNavigatingHref(null);
  };

  const handleDeckKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (index + 1) % view.actions.length;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (index - 1 + view.actions.length) % view.actions.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = view.actions.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextAction = view.actions[nextIndex];
    selectAction(nextAction);
    actionRefs.current[nextIndex]?.focus();
  };

  return (
    <>
      <section
        className="customer-home-hero customer-card"
        data-has-confirmed-look={view.confirmedImageUrl ? "true" : "false"}
        aria-labelledby="customer-home-hero-title"
      >
        <div className="customer-home-hero__copy" aria-live="polite">
          <p className="customer-kicker">{selected.kicker}</p>
          <h2 id="customer-home-hero-title">{selected.title}</h2>
          <p>{selected.body}</p>
          <Link
            href={selected.href}
            prefetch={false}
            className="customer-primary-button"
            aria-busy={navigatingHref === selected.href}
            onClick={() => setNavigatingHref(selected.href)}
          >
            {navigatingHref === selected.href ? "이동 중…" : selected.ctaLabel}
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>

        {view.recommendation ? (
          <aside className="customer-home-hero__recommendation" data-customer-home-recommendation="true">
            <p className="customer-kicker">Recommended next step</p>
            <h3>{view.recommendation.title}</h3>
            <p>{view.recommendation.body}</p>
            <dl>
              <div><dt>현재</dt><dd>{view.recommendation.currentStep.replace("현재 단계 · ", "")}</dd></div>
              <div><dt>다음</dt><dd>{view.recommendation.nextStep.replace("다음 행동 · ", "")}</dd></div>
            </dl>
          </aside>
        ) : null}

        {view.confirmedImageUrl ? (
          <div className="customer-home-hero__visual" data-customer-home-confirmed-look="true">
            <img src={view.confirmedImageUrl} alt={view.confirmedImageAlt || "확정한 스타일 결과"} />
          </div>
        ) : null}
      </section>

      <section className="customer-home-priority" aria-labelledby="priority-heading">
        <div className="customer-section-heading">
          <div>
            <p className="customer-kicker">Your next move</p>
            <h2 id="priority-heading">지금 필요한 일부터</h2>
          </div>
          <p>항목을 선택하면 위 안내와 다음 행동이 바로 바뀝니다.</p>
        </div>

        <div className="customer-home-priority__grid" aria-label="홈 주요 액션">
          {view.actions.map((action, index) => {
            const Icon = ACTION_ICONS[action.icon];
            const selectedAction = action.id === selected.id;
            return (
              <button
                key={action.id}
                ref={(node) => { actionRefs.current[index] = node; }}
                type="button"
                className="customer-card customer-home-priority__card"
                aria-pressed={selectedAction}
                aria-controls="customer-home-hero-title"
                data-action-id={action.id}
                data-available={action.available ? "true" : "false"}
                onClick={() => selectAction(action)}
                onKeyDown={(event) => handleDeckKeyDown(event, index)}
              >
                <span className="customer-home-priority__icon"><Icon aria-hidden="true" /></span>
                <span className="customer-kicker">{action.kicker}</span>
                <strong>{action.title}</strong>
                <span className="customer-home-priority__body">{action.body}</span>
                <span className="customer-text-link">
                  {selectedAction ? "선택됨" : "안내 보기"}
                  <ArrowRight aria-hidden="true" />
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}
