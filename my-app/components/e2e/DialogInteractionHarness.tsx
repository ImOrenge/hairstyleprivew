"use client";

import { useState } from "react";
import type { GeneratedVariant } from "../../lib/recommendation-types";
import { AccountSetupPromptModal } from "../home/AccountSetupPromptModal";
import { SubscriptionPaymentNoticeModal } from "../layout/SubscriptionPaymentNoticeModal";
import { FeedbackModal } from "../result/FeedbackModal";
import { StylerHairSelectionModal } from "../styler/StylerHairSelectionModal";
import type { StylerHairstyleGenerationGroup } from "../styler/stylerNewModel";
import { Button } from "../ui/Button";
import { ConfirmActionDialog } from "../ui/ConfirmActionDialog";
import { Panel, SurfaceCard } from "../ui/Surface";

const variant: GeneratedVariant = {
  id: "e2e-variant-1",
  rank: 1,
  label: "소프트 크롭",
  reason: "얼굴선을 또렷하게 보여 주는 균형 잡힌 짧은 스타일입니다.",
  prompt: "e2e prompt",
  negativePrompt: "e2e negative prompt",
  tags: ["짧은 기장", "정수리 볼륨"],
  lengthBucket: "short",
  correctionFocus: "crown",
  status: "completed",
  outputUrl: "/logo.png",
  generatedImagePath: "e2e/result.png",
  evaluation: null,
  designerBrief: null,
  error: null,
  generatedAt: "2026-07-18T00:00:00.000Z",
};

const groups: StylerHairstyleGenerationGroup[] = [
  {
    id: "e2e-generation-1",
    createdAt: "2026-07-18T00:00:00.000Z",
    status: "completed",
    selectedVariantId: null,
    analysis: {
      faceShape: "타원형",
      headShape: "균형형",
      foreheadExposure: "보통",
      observedPartingShape: "자연 가르마",
      recommendedPartingShape: "6:4 가르마",
      partingStrategy: "이마선을 자연스럽게 드러냅니다.",
      balance: "좌우 볼륨 균형",
      bestLengthStrategy: "짧은 기장",
      volumeFocus: ["정수리"],
      avoidNotes: [],
      summary: "짧은 기장과 정수리 볼륨이 어울립니다.",
    },
    variants: [variant],
  },
];

export function DialogInteractionHarness({
  renderSubscriptionNotice,
}: {
  renderSubscriptionNotice: boolean;
}) {
  const [stylerOpen, setStylerOpen] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const [confirmPending, setConfirmPending] = useState(false);
  const [confirmResult, setConfirmResult] = useState("변경 전");

  return (
    <main className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-10">
      <Panel as="section" className="p-6">
        <p className="app-kicker">E2E 전용</p>
        <h1 className="mt-2 text-3xl font-black text-[var(--app-text)]">운영 Dialog 상호작용 검증</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">
          운영 컴포넌트의 포커스 이동, 키보드 조작, 자동 공지 우선순위를 검증합니다.
        </p>
      </Panel>

      <SurfaceCard as="section" className="grid gap-3 p-5">
        <h2 className="text-lg font-bold text-[var(--app-text)]">결과 리뷰</h2>
        <FeedbackModal generationId="e2e-generation-1" />
      </SurfaceCard>

      <SurfaceCard as="section" className="grid gap-3 p-5">
        <h2 className="text-lg font-bold text-[var(--app-text)]">Styler 헤어 선택</h2>
        <div>
          <Button id="open-styler-hair-selection" onClick={() => setStylerOpen(true)}>
            Styler 선택 Dialog 열기
          </Button>
        </div>
        <p role="status" aria-live="polite" className="text-sm text-[var(--app-muted)]">
          {selectedVariantId ? "소프트 크롭 선택 완료" : "선택 전"}
        </p>
        <StylerHairSelectionModal
          open={stylerOpen}
          groups={groups}
          isLoading={false}
          error={null}
          selectedVariantId={selectedVariantId}
          onClose={() => setStylerOpen(false)}
          onSelect={(_generationId, selectedVariant) => {
            setSelectedVariantId(selectedVariant.id);
            setStylerOpen(false);
          }}
        />
      </SurfaceCard>

      <SurfaceCard as="section" className="grid gap-3 p-5">
        <h2 className="text-lg font-bold text-[var(--app-text)]">고위험 작업 확인</h2>
        <div>
          <Button
            id="open-confirm-action"
            variant="secondary"
            onClick={() => {
              setConfirmationText("");
              setConfirmOpen(true);
            }}
          >
            고위험 변경 Dialog 열기
          </Button>
        </div>
        <p role="status" aria-live="polite" className="text-sm text-[var(--app-muted)]">
          {confirmResult}
        </p>
        <ConfirmActionDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          onConfirm={() => {
            setConfirmPending(true);
            window.setTimeout(() => {
              setConfirmPending(false);
              setConfirmOpen(false);
              setConfirmResult("크레딧 변경 완료");
            }, 250);
          }}
          title="고위험 변경 확인"
          description="대상과 변경값을 확인하고 지정된 문구를 입력해 주세요."
          confirmLabel="변경 실행"
          pendingLabel="변경 처리 중…"
          isPending={confirmPending}
          confirmDisabled={confirmationText !== "변경 확인"}
          tone="danger"
          target="테스트 회원"
          beforeValue="100 크레딧"
          afterValue="80 크레딧"
          confirmationSlot={
            <label className="grid gap-2 text-sm font-semibold text-[var(--app-text)]" htmlFor="e2e-confirmation-text">
              변경 확인 입력
              <input
                id="e2e-confirmation-text"
                className="app-input px-3 py-2"
                value={confirmationText}
                onChange={(event) => setConfirmationText(event.target.value)}
                autoComplete="off"
              />
            </label>
          }
        />
      </SurfaceCard>

      <AccountSetupPromptModal open />
      {renderSubscriptionNotice ? <SubscriptionPaymentNoticeModal /> : null}
    </main>
  );
}
