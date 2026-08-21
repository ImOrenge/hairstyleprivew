import assert from "node:assert/strict";
import test from "node:test";
import { buildConsultationResultNarrativeFallbackV1, consultationResultNarrativeStateV1, normalizeConsultationResultNarrativeV1, type ConsultationResultNarrativeInputV1 } from "./report-narrative.ts";

const input: ConsultationResultNarrativeInputV1 = {
  schemaVersion: "consultation-result-narrative-input-v1",
  reportFingerprint: "report-facts-v1",
  availableTabs: ["hair"],
  facts: [
    { id: "final-decision", tab: "final", kind: "decision", label: "종합 결론", value: "부드러운 균형을 중심으로 결과를 정리했습니다." },
    { id: "hair-decision", tab: "hair", kind: "decision", label: "확정 헤어", value: "소프트 미디엄 레이어" },
    { id: "hair-reason", tab: "hair", kind: "reason", label: "어울리는 이유", value: "얼굴 옆선을 자연스럽게 정돈합니다." },
    { id: "hair-action", tab: "hair", kind: "guidance", label: "활용법", value: "끝선을 가볍게 정돈해 보세요." },
  ],
};

function output() {
  return {
    schemaVersion: "consultation-result-narrative-v1",
    reportFingerprint: input.reportFingerprint,
    overall: {
      headline: "하나의 스타일 방향으로 연결했어요",
      summary: [
        { text: "부드러운 균형을 중심으로 결과를 정리했습니다.", evidenceIds: ["final-decision"] },
        { text: "소프트 미디엄 레이어가 전체 인상을 이어 줍니다.", evidenceIds: ["hair-decision"] },
        { text: "얼굴 옆선을 자연스럽게 정돈하는 방향입니다.", evidenceIds: ["hair-reason"] },
      ],
      fitReasons: [{ text: "얼굴 옆선을 자연스럽게 정돈합니다.", evidenceIds: ["hair-reason"] }],
      actions: [{ text: "끝선을 가볍게 정돈해 보세요.", evidenceIds: ["hair-action"] }],
    },
    tabs: {
      hair: {
        headline: "헤어 결과를 이렇게 활용해 보세요",
        summary: [
          { text: "소프트 미디엄 레이어를 선택했습니다.", evidenceIds: ["hair-decision"] },
          { text: "얼굴 옆선을 자연스럽게 정돈합니다.", evidenceIds: ["hair-reason"] },
        ],
        fitReasons: [{ text: "얼굴 옆선을 자연스럽게 정돈합니다.", evidenceIds: ["hair-reason"] }],
        actions: [{ text: "끝선을 가볍게 정돈해 보세요.", evidenceIds: ["hair-action"] }],
      },
    },
  };
}

test("accepts a grounded structured consultation result narrative", () => {
  const normalized = normalizeConsultationResultNarrativeV1(output(), input);
  assert.equal(normalized.tabs.hair?.summary.length, 2);
  assert.deepEqual(normalized.tabs.hair?.actions[0].evidenceIds, ["hair-action"]);
});

test("rejects evidence that is absent or belongs to another result tab", () => {
  const value = output();
  value.tabs.hair.summary[0].evidenceIds = ["final-decision"];
  assert.throws(() => normalizeConsultationResultNarrativeV1(value, input), /RESULT_NARRATIVE_EVIDENCE_INVALID/);
});

test("rejects invented numbers, internal terminology, and missing tab explanations", () => {
  const inventedNumber = output();
  inventedNumber.tabs.hair.summary[0].text = "만족도가 95점인 소프트 미디엄 레이어입니다.";
  assert.throws(() => normalizeConsultationResultNarrativeV1(inventedNumber, input), /RESULT_NARRATIVE_NUMBER_UNGROUNDED/);

  const internalCopy = output();
  internalCopy.overall.headline = "결과 fingerprint를 확인했어요";
  assert.throws(() => normalizeConsultationResultNarrativeV1(internalCopy, input), /RESULT_NARRATIVE_TEXT_INVALID/);

  const missingTab = output();
  delete (missingTab.tabs as { hair?: unknown }).hair;
  assert.throws(() => normalizeConsultationResultNarrativeV1(missingTab, input), /RESULT_NARRATIVE_TAB_MISSING/);
});

test("fallback stays complete while asynchronous generation prepares, fails, and retries", () => {
  const fallback = buildConsultationResultNarrativeFallbackV1(input);
  assert.equal(fallback.overall.summary.length, 3);
  assert.equal(fallback.tabs.hair?.summary.length, 2);
  assert.equal(consultationResultNarrativeStateV1(null, false), "fallback");
  assert.equal(consultationResultNarrativeStateV1("queued", false), "preparing");
  assert.equal(consultationResultNarrativeStateV1("failed", false), "failed");
  assert.equal(consultationResultNarrativeStateV1("retry_required", false), "failed");
  assert.equal(consultationResultNarrativeStateV1("completed", true), "ready");
});
