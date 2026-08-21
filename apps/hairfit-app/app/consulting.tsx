import { useAuth } from "@clerk/clerk-expo";
import type {
  AnalysisEvidenceV2,
  AftercareProgramV2,
  ConsultationSnapshot,
  ConsultationSessionV2,
  FashionDirectionSnapshot,
  FashionPreviewBatch,
  FashionPreviewCandidateV2,
  PreviewBoardV2,
  SalonBriefV2,
  StyleSelectionSnapshotV2,
  PersonalColorProfileV2,
  MakeupArtistBrief,
  MakeupContextProfile,
  MakeupDirectionSnapshot,
  MakeupModule,
  MakeupRoutine,
  HairProfileV2,
  HairTraitAnalysisRunV1,
  DiagnosticQuestionInstanceV1,
  HairAdjustmentAspect,
  HairRecommendationDecisionV1,
  MakeupSimulationRunV1,
  MakeupSimulationOutputV1,
  MakeupSimulationSelectionSnapshotV1,
  ConsultationReportViewModelV2,
} from "@hairfit/shared";
import {
  CONSULTATION_CHAPTERS,
  deriveConsultationChapterPresentation,
  effectiveEvidencePointV2,
  type OptionalOpeningIntent,
} from "@hairfit/shared";
import {
  BodyText,
  Button,
  Card,
  Chip,
  Cluster,
  Heading,
  Kicker,
  Panel,
  Stack,
} from "@hairfit/ui-native";
import * as Crypto from "expo-crypto";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  AppState,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppScreen } from "../components/app/AppScreen";
import { NativeFaceEvidenceOverlay } from "../components/consulting/NativeFaceEvidenceOverlay";
import { NativeMakeupDirectionV1 } from "../components/consulting/NativeMakeupDirectionV1";
import { NativePersonalColorProfileV2 } from "../components/consulting/NativePersonalColorProfileV2";
import { useHairfitApi } from "../lib/api";
import { mapMobileUserError } from "../lib/mobile-user-message";
import {
  clearActiveV2ConsultationId,
  readActiveV2ConsultationId,
  saveActiveV2ConsultationId,
} from "../lib/v2-consultation-resume";
import { isMobileV2ConsultationEnabled } from "../lib/v2-consultation-feature";

type EvidenceState = {
  evidence: AnalysisEvidenceV2;
  sourceImageUrl: string | null;
  overlayEnabled: boolean;
};

type ActualServiceState = {
  id: string;
  services: string[];
  serviceDate: string;
  designerNotes: string;
  confirmedAt: string;
};

type MobileMakeupState = {
  snapshot: MakeupDirectionSnapshot | null;
  revision: number | null;
  defaultContext: MakeupContextProfile;
  routine: MakeupRoutine | null;
  brief: MakeupArtistBrief | null;
  simulationEnabled: boolean;
  simulation: {
    run: MakeupSimulationRunV1 | null;
    outputs: MakeupSimulationOutputV1[];
    selection: MakeupSimulationSelectionSnapshotV1 | null;
    workspaceState: string;
  };
};

type MobileHairDiagnosisState = {
  run: HairTraitAnalysisRunV1 | null;
  profile: HairProfileV2 | null;
  questions: DiagnosticQuestionInstanceV1[];
};

const FASHION_TOPICS = [
  "context",
  "impression",
  "fit",
  "exposure",
  "season",
  "budget",
  "avoid",
] as const;
const HAIR_ADJUSTMENT_OPTIONS: readonly {
  aspect: HairAdjustmentAspect;
  label: string;
}[] = [
  { aspect: "length", label: "기장" },
  { aspect: "bangs", label: "앞머리" },
  { aspect: "volume", label: "볼륨" },
  { aspect: "curl-texture", label: "컬·질감" },
  { aspect: "face-exposure", label: "얼굴 노출" },
  { aspect: "maintenance", label: "관리 난이도" },
  { aspect: "change-intensity", label: "변화 강도" },
  { aspect: "free-text", label: "직접 설명" },
];

function acceptedImage(board: PreviewBoardV2, variantId: string) {
  const variant = board.variants.find((item) => item.id === variantId);
  return (
    [...(variant?.attempts ?? [])]
      .reverse()
      .find((attempt) => attempt.status === "accepted" && attempt.outputUrl)
      ?.outputUrl ?? null
  );
}

function stateLabel(state: ConsultationSessionV2["state"]) {
  const labels: Record<ConsultationSessionV2["state"], string> = {
    draft: "사진 준비",
    photo_validated: "사진 확인",
    analysis_ready: "AI 분석 완료",
    preview_board_queued: "3×3 생성 중",
    preview_board_ready: "비교 준비",
    shortlisted: "후보 비교",
    style_selected: "최종 확인",
    selection_confirmed: "헤어 확정",
    salon_brief_ready: "살롱 브리프 준비",
    aftercare_ready: "애프터케어 준비",
    fashion_ready: "패션 룩 준비",
    completed: "상담 완료",
    cancelled: "상담 취소",
  };
  return labels[state];
}

export default function MobileConsultingScreen() {
  const { isLoaded, isSignedIn } = useAuth();
  const api = useHairfitApi();
  const router = useRouter();
  const [consultation, setConsultation] =
    useState<ConsultationSessionV2 | null>(null);
  const [workspace, setWorkspace] = useState<ConsultationSnapshot | null>(null);
  const [openingIntent, setOpeningIntent] =
    useState<OptionalOpeningIntent | null>(null);
  const [openingIntentOpen, setOpeningIntentOpen] = useState(false);
  const [board, setBoard] = useState<PreviewBoardV2 | null>(null);
  const [evidence, setEvidence] = useState<EvidenceState | null>(null);
  const [selection, setSelection] = useState<StyleSelectionSnapshotV2 | null>(
    null,
  );
  const [brief, setBrief] = useState<SalonBriefV2 | null>(null);
  const [aftercare, setAftercare] = useState<AftercareProgramV2 | null>(null);
  const [actualService, setActualService] = useState<ActualServiceState | null>(
    null,
  );
  const [serviceTypes, setServiceTypes] = useState<string[]>([]);
  const [serviceDate, setServiceDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [fashionDirection, setFashionDirection] =
    useState<FashionDirectionSnapshot | null>(null);
  const [fashionBatch, setFashionBatch] = useState<FashionPreviewBatch | null>(
    null,
  );
  const [fashionAdaptiveEnabled, setFashionAdaptiveEnabled] = useState(true);
  const [fashionPreviews, setFashionPreviews] = useState<
    FashionPreviewCandidateV2[]
  >([]);
  const [fashionShortlist, setFashionShortlist] = useState<string[]>([]);
  const [fashionFinalist, setFashionFinalist] = useState<string | null>(null);
  const [shortlist, setShortlist] = useState<string[]>([]);
  const [finalistId, setFinalistId] = useState<string | null>(null);
  const [hairRecommendation, setHairRecommendation] =
    useState<HairRecommendationDecisionV1 | null>(null);
  const [hairAdjustmentAspect, setHairAdjustmentAspect] =
    useState<HairAdjustmentAspect>("length");
  const [hairAdjustmentValue, setHairAdjustmentValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedLandmarkId, setSelectedLandmarkId] = useState<string | null>(
    null,
  );
  const [personalColorProfile, setPersonalColorProfile] =
    useState<PersonalColorProfileV2 | null>(null);
  const [trainingConsent, setTrainingConsent] = useState(false);
  const [makeup, setMakeup] = useState<MobileMakeupState | null>(null);
  const [hairDiagnosis, setHairDiagnosis] =
    useState<MobileHairDiagnosisState | null>(null);
  const [report, setReport] = useState<ConsultationReportViewModelV2 | null>(null);

  const load = useCallback(
    async (consultationId: string) => {
      setLoading(true);
      setMessage(null);
      try {
        const [workspaceResponse, response] = await Promise.all([
          api.getConsultation(consultationId),
          api.getV2Consultation(consultationId),
        ]);
        setWorkspace(workspaceResponse.snapshot);
        setFashionDirection(
          workspaceResponse.snapshot.fashion.directionSnapshot,
        );
        const next = response.consultation;
        setConsultation(next);
        await saveActiveV2ConsultationId(next.id);

        const outputReady = Boolean(next.selectedSnapshotId);
        const [
          nextEvidence,
          nextBoard,
          nextShortlist,
          nextSelection,
          nextBrief,
          nextAftercare,
          nextFashion,
          nextFashionBatch,
          nextPersonalColor,
          nextTrainingConsent,
          nextMakeup,
          nextHairDiagnosis,
          nextHairRecommendation,
          nextReport,
        ] = await Promise.all([
          next.analysisEvidenceId
            ? api.getV2AnalysisEvidence(next.id).catch(() => null)
            : Promise.resolve(null),
          next.sourceGenerationId
            ? api.getV2PreviewBoard(next.id).catch(() => null)
            : Promise.resolve(null),
          [
            "shortlisted",
            "style_selected",
            "selection_confirmed",
            "salon_brief_ready",
            "aftercare_ready",
            "fashion_ready",
            "completed",
          ].includes(next.state)
            ? api.getV2Shortlist(next.id).catch(() => null)
            : Promise.resolve(null),
          next.selectedSnapshotId
            ? api.getV2Selection(next.id).catch(() => null)
            : Promise.resolve(null),
          outputReady
            ? api
                .createV2SalonBrief(
                  next.id,
                  `mobile-brief:auto:${next.id}:${next.selectedSnapshotId}`,
                )
                .catch(() => null)
            : Promise.resolve(null),
          outputReady
            ? api.getV2Aftercare(next.id).catch(() => null)
            : Promise.resolve(null),
          outputReady
            ? api.getV2FashionPreviews(next.id).catch(() => null)
            : Promise.resolve(null),
          outputReady
            ? api.getV2FashionBatch(next.id).catch(() => null)
            : Promise.resolve(null),
          next.analysisEvidenceId
            ? api.getPersonalColorProfileV2(next.id).catch(() => null)
            : Promise.resolve(null),
          next.analysisEvidenceId
            ? api.getPersonalColorTrainingConsent(next.id).catch(() => null)
            : Promise.resolve(null),
          outputReady
            ? api.getMakeupDirection(next.id).catch(() => null)
            : Promise.resolve(null),
          next.analysisEvidenceId
            ? api.getHairProfile(next.id).catch(() => null)
            : Promise.resolve(null),
          next.sourceGenerationId
            ? api.getV2HairRecommendation(next.id).catch(() => null)
            : Promise.resolve(null),
          outputReady
            ? api.getV2ConsultationReport(next.id).catch(() => null)
            : Promise.resolve(null),
        ]);
        const resolvedHairRecommendation =
          nextHairRecommendation ??
          (nextBoard?.board?.state === "ready"
            ? await api
                .evaluateV2HairRecommendation(next.id)
                .then((result) => ({
                  decision: result.decision,
                  board: nextBoard.board,
                }))
                .catch(() => null)
            : null);
        setEvidence(nextEvidence);
        setSelectedLandmarkId((current) =>
          current &&
          nextEvidence?.evidence.landmarks.some((item) => item.id === current)
            ? current
            : (nextEvidence?.evidence.landmarks[0]?.id ?? null),
        );
        setBoard(nextBoard?.board ?? null);
        if (nextShortlist?.shortlist.previewVariantIds) {
          setShortlist(nextShortlist.shortlist.previewVariantIds);
        }
        setSelection(nextSelection?.selection ?? null);
        if (nextSelection?.selection)
          setFinalistId(nextSelection.selection.previewVariantId);
        setBrief(nextBrief?.brief ?? null);
        setAftercare(nextAftercare?.program ?? null);
        setActualService(nextAftercare?.actualService ?? null);
        setFashionPreviews(nextFashion?.previews ?? []);
        setFashionBatch(nextFashionBatch?.batch ?? null);
        if (typeof nextFashionBatch?.adaptiveEnabled === "boolean") setFashionAdaptiveEnabled(nextFashionBatch.adaptiveEnabled);
        if (nextFashion?.previewSet) {
          setFashionShortlist(nextFashion.previewSet.stylingSessionIds);
          setFashionFinalist(nextFashion.previewSet.selectedStylingSessionId);
        } else if (nextFashionBatch?.batch?.recommendedPreviewId) {
          setFashionShortlist([nextFashionBatch.batch.recommendedPreviewId]);
          setFashionFinalist(nextFashionBatch.batch.recommendedPreviewId);
        }
        setPersonalColorProfile(nextPersonalColor?.profile ?? null);
        setTrainingConsent(nextTrainingConsent?.granted === true);
        setMakeup(
          nextMakeup
            ? {
                snapshot: nextMakeup.snapshot,
                revision: nextMakeup.revision,
                defaultContext: nextMakeup.defaultContext,
                routine: nextMakeup.artifacts.routine,
                brief: nextMakeup.artifacts.brief,
                simulationEnabled: nextMakeup.simulationEnabled,
                simulation: nextMakeup.simulation,
              }
            : null,
        );
        setHairDiagnosis(nextHairDiagnosis);
        setHairRecommendation(resolvedHairRecommendation?.decision ?? null);
        setReport(nextReport?.report ?? null);
      } catch (error) {
        setMessage(
          mapMobileUserError(error, "진행 중인 AI 상담을 불러오지 못했습니다."),
        );
      } finally {
        setLoading(false);
      }
    },
    [api],
  );

  useEffect(() => {
    if (!isLoaded) return;
    if (!isMobileV2ConsultationEnabled()) {
      router.replace("/upload");
      return;
    }
    if (!isSignedIn) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    void readActiveV2ConsultationId().then((consultationId) => {
      if (cancelled) return;
      if (consultationId) void load(consultationId);
      else setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, load, router]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      void readActiveV2ConsultationId().then((consultationId) =>
        consultationId ? load(consultationId) : undefined,
      );
    });
    return () => subscription.remove();
  }, [load]);

  useEffect(() => {
    if (
      !consultation ||
      !fashionBatch ||
      !["approved", "generating", "partial"].includes(fashionBatch.state)
    )
      return;
    const timer = setInterval(() => {
      void Promise.all([
        api.reconcileV2FashionBatch(consultation.id, fashionBatch.id),
        api.getV2FashionPreviews(consultation.id),
      ])
        .then(([batchResponse, previewResponse]) => {
          setFashionBatch(batchResponse.batch);
          setFashionPreviews(previewResponse.previews);
          if (batchResponse.batch.recommendedPreviewId) {
            setFashionFinalist((current) => current ?? batchResponse.batch.recommendedPreviewId);
            setFashionShortlist((current) => current.length ? current : [batchResponse.batch.recommendedPreviewId as string]);
          }
        })
        .catch(() => undefined);
    }, 4_000);
    return () => clearInterval(timer);
  }, [api, consultation, fashionBatch]);

  const create = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await api.createConsultation(
        `mobile-consulting:${Crypto.randomUUID()}`,
      );
      await saveActiveV2ConsultationId(response.snapshot.sessionId);
      await load(response.snapshot.sessionId);
    } catch (error) {
      setMessage(
        mapMobileUserError(error, "새 AI 상담을 시작하지 못했습니다."),
      );
    } finally {
      setLoading(false);
    }
  };

  const changeTrainingConsent = async (granted: boolean) => {
    if (!consultation) return;
    setLoading(true);
    try {
      const consent = await api.setPersonalColorTrainingConsent({
        consultationId: consultation.id,
        granted,
        idempotencyKey: `mobile-training:${granted ? "grant" : "revoke"}:${Crypto.randomUUID()}`,
      });
      setTrainingConsent(consent.granted);
      setMessage(
        consent.granted
          ? "선택 학습 동의를 저장했습니다."
          : "학습 동의를 철회했습니다.",
      );
    } catch (error) {
      setMessage(mapMobileUserError(error, "학습 동의를 저장하지 못했습니다."));
    } finally {
      setLoading(false);
    }
  };

  const prepareMakeup = async (context: MakeupContextProfile) => {
    if (!consultation) return;
    setLoading(true);
    try {
      const saved = await api.saveMakeupContext(consultation.id, context);
      const built = await api.buildMakeupDirection(
        consultation.id,
        saved.revision,
      );
      setMakeup((current) =>
        current
          ? { ...current, snapshot: built.snapshot, revision: built.revision }
          : {
              snapshot: built.snapshot,
              revision: built.revision,
              defaultContext: context,
              routine: null,
              brief: null,
              simulationEnabled: false,
              simulation: { run: null, outputs: [], selection: null, workspaceState: "direction-map" },
            },
      );
      setMessage("실제 얼굴 좌표로 7개 메이크업 존을 만들었습니다.");
    } catch (error) {
      setMessage(
        mapMobileUserError(error, "메이크업 방향을 준비하지 못했습니다."),
      );
    } finally {
      setLoading(false);
    }
  };

  const toggleMakeupModule = async (module: MakeupModule, enabled: boolean) => {
    if (!consultation || !makeup?.snapshot || makeup.revision === null) return;
    setLoading(true);
    try {
      const updated = await api.patchMakeupModule({
        consultationId: consultation.id,
        snapshotId: makeup.snapshot.id,
        module,
        patch: {
          expectedRevision: makeup.revision,
          state: enabled ? "enabled" : "disabled_by_user",
        },
      });
      setMakeup({
        ...makeup,
        snapshot: updated.snapshot,
        revision: updated.revision,
      });
    } catch (error) {
      setMessage(
        mapMobileUserError(error, "메이크업 모듈을 조정하지 못했습니다."),
      );
    } finally {
      setLoading(false);
    }
  };

  const confirmMakeup = async () => {
    if (!consultation || !makeup?.snapshot || makeup.revision === null) return;
    setLoading(true);
    try {
      const confirmed = await api.confirmMakeupDirection(
        consultation.id,
        makeup.snapshot.id,
        makeup.revision,
      );
      setMakeup({
        ...makeup,
        snapshot: confirmed.snapshot,
        revision: confirmed.revision,
        routine: confirmed.artifacts.routine,
        brief: confirmed.artifacts.brief,
      });
      await load(consultation.id);
    } catch (error) {
      setMessage(
        mapMobileUserError(error, "메이크업 방향을 확정하지 못했습니다."),
      );
      setLoading(false);
    }
  };

  const toggleShortlist = (variantId: string) => {
    if (!board || !acceptedImage(board, variantId)) return;
    setShortlist((current) =>
      current.includes(variantId)
        ? current.filter((item) => item !== variantId)
        : current.length < 3
          ? [...current, variantId]
          : current,
    );
  };

  const saveShortlist = async () => {
    if (!consultation || shortlist.length < 2 || shortlist.length > 3) return;
    setLoading(true);
    try {
      await api.saveV2Shortlist(
        consultation.id,
        shortlist,
        consultation.version,
      );
      await load(consultation.id);
    } catch (error) {
      setMessage(
        mapMobileUserError(error, "후보 비교 목록을 저장하지 못했습니다."),
      );
      setLoading(false);
    }
  };

  const draftSelection = async () => {
    if (!consultation || !finalistId) return;
    setLoading(true);
    try {
      await api.selectV2Style(
        consultation.id,
        finalistId,
        consultation.version,
      );
      await load(consultation.id);
    } catch (error) {
      setMessage(
        mapMobileUserError(error, "최종 헤어 선택을 저장하지 못했습니다."),
      );
      setLoading(false);
    }
  };

  const confirmSelection = async () => {
    if (!consultation || !selection) return;
    setLoading(true);
    try {
      await api.confirmV2Style(
        consultation.id,
        selection.id,
        consultation.version,
      );
      await load(consultation.id);
    } catch (error) {
      setMessage(mapMobileUserError(error, "최종 헤어를 확정하지 못했습니다."));
      setLoading(false);
    }
  };

  const answerHairClarification = async (answer: string) => {
    if (!consultation || !hairRecommendation) return;
    setLoading(true);
    try {
      const result = await api.answerV2HairRecommendationClarification(
        consultation.id,
        hairRecommendation.revision,
        answer,
      );
      setHairRecommendation(result.decision);
    } catch (error) {
      setMessage(mapMobileUserError(error, "추가 답변을 반영하지 못했습니다."));
    } finally {
      setLoading(false);
    }
  };

  const confirmHairRecommendation = async () => {
    if (!consultation || !hairRecommendation) return;
    setLoading(true);
    try {
      const result = await api.confirmV2HairRecommendation(
        consultation.id,
        hairRecommendation.revision,
      );
      setHairRecommendation(result.decision);
      await load(consultation.id);
    } catch (error) {
      setMessage(mapMobileUserError(error, "AI 주 추천을 확정하지 못했습니다."));
      setLoading(false);
    }
  };

  const requestHairAdjustment = async () => {
    if (!consultation || !hairRecommendation || !hairAdjustmentValue.trim())
      return;
    setLoading(true);
    try {
      const result = await api.adjustV2HairRecommendation(
        consultation.id,
        hairRecommendation.revision,
        [{ aspect: hairAdjustmentAspect, value: hairAdjustmentValue.trim() }],
        `${consultation.id}:native-hair-adjust:${hairRecommendation.revision}`,
      );
      setHairRecommendation(result.decision);
      setHairAdjustmentValue("");
      setMessage("조정 요청을 저장했습니다. 방향을 반영해 새 9개를 준비합니다.");
    } catch (error) {
      setMessage(mapMobileUserError(error, "헤어 조정 요청을 저장하지 못했습니다."));
    } finally {
      setLoading(false);
    }
  };

  const startPhotoDiagnosis = async () => {
    if (!workspace) return;
    setLoading(true);
    try {
      const response = await api.updateConsultationStartContext(workspace.sessionId, {
        expectedVersion: workspace.version,
        optionalOpeningIntent: openingIntent,
      });
      setWorkspace(response.snapshot);
      setMessage("사진을 제출하면 AI가 먼저 분석하고 필요한 것만 질문합니다.");
    } catch (error) {
      setMessage(mapMobileUserError(error, "사진 진단을 시작하지 못했습니다."));
    } finally {
      setLoading(false);
    }
  };

  const answerHairQuestion = async (
    question: DiagnosticQuestionInstanceV1,
    value: unknown,
    state: "answered" | "unknown" = "answered",
  ) => {
    if (!consultation || !hairDiagnosis?.profile) return;
    setLoading(true);
    try {
      const next = await api.answerHairProfileQuestion({
        consultationId: consultation.id,
        questionId: question.id,
        expectedRevision: hairDiagnosis.profile.revision,
        value,
        state,
      });
      setHairDiagnosis(next);
      setMessage("모질 확인 답변을 저장했습니다.");
    } catch (error) {
      setMessage(
        mapMobileUserError(error, "모질 확인 답변을 저장하지 못했습니다."),
      );
    } finally {
      setLoading(false);
    }
  };

  const saveFashionTopic = async (
    topic: (typeof FASHION_TOPICS)[number],
    nextDirection: FashionDirectionSnapshot,
  ) => {
    if (!workspace) return;
    setLoading(true);
    try {
      const field =
        topic === "context"
          ? "situation"
          : topic === "impression"
            ? "genre"
            : topic === "avoid"
              ? "avoidItems"
              : topic;
      const normalized: FashionDirectionSnapshot = {
        ...nextDirection,
        fieldProvenance: {
          ...nextDirection.fieldProvenance,
          [`topic:${topic}`]: "user",
          [field]: "user",
        },
        interviewRevision: (nextDirection.interviewRevision ?? 0) + 1,
      };
      const response = await api.updateConsultation(workspace.sessionId, {
        expectedVersion: workspace.version,
        fashion: { ...workspace.fashion, directionSnapshot: normalized },
        currentStage: "fashion",
      });
      setWorkspace(response.snapshot);
      setFashionDirection(response.snapshot.fashion.directionSnapshot);
      setMessage("패션 방향을 서버 상담에 저장했습니다.");
    } catch (error) {
      setMessage(
        mapMobileUserError(
          error,
          "패션 방향을 저장하지 못했습니다. 서버 상태를 다시 불러옵니다.",
        ),
      );
      if (consultation) await load(consultation.id).catch(() => undefined);
    } finally {
      setLoading(false);
    }
  };

  const prepareFashion = async () => {
    if (!consultation || !fashionDirection) return;
    setLoading(true);
    setMessage(null);
    try {
      const response = await api.prepareV2FashionBatch({
        consultationId: consultation.id,
        idempotencyKey: `mobile-fashion:${consultation.id}:${fashionDirection.interviewRevision ?? 0}`,
        direction: fashionDirection,
      });
      setFashionBatch(response.batch);
      await load(consultation.id);
    } catch (error) {
      setMessage(
        mapMobileUserError(error, "패션 룩을 접수하지 못했습니다."),
      );
    } finally {
      setLoading(false);
    }
  };

  const expandFashion = async () => {
    if (!consultation || !fashionBatch || fashionBatch.requestedCount >= 9 || fashionBatch.terminalCount !== fashionBatch.requestedCount) return;
    const expectedRequestedCount = fashionBatch.requestedCount as 3 | 6;
    const targetRequestedCount = expectedRequestedCount === 3 ? 6 : 9;
    setLoading(true);
    try {
      const response = await api.expandV2FashionBatch({
        consultationId: consultation.id,
        batchId: fashionBatch.id,
        expectedRequestedCount,
        targetRequestedCount,
        idempotencyKey: `mobile-fashion:${consultation.id}:${fashionBatch.generationInputFingerprint}:${targetRequestedCount}`,
      });
      setFashionBatch(response.batch);
      await load(consultation.id);
    } catch (error) { setMessage(mapMobileUserError(error, "패션 룩 3개를 추가하지 못했습니다.")); }
    finally { setLoading(false); }
  };

  const resumeFashion = async () => {
    if (!consultation || !fashionBatch) return;
    setLoading(true);
    try {
      await api.dispatchV2FashionBatch(consultation.id, fashionBatch.id);
      await load(consultation.id);
    } catch (error) {
      setMessage(
        mapMobileUserError(error, "미완료 패션 룩을 다시 접수하지 못했습니다."),
      );
    } finally {
      setLoading(false);
    }
  };

  const saveFashionSelection = async () => {
    if (
      !consultation ||
      !fashionFinalist ||
      !fashionBatch
    )
      return;
    setLoading(true);
    try {
      const selection = await api.selectV2FashionBatchPreview({
        consultationId: consultation.id,
        batchId: fashionBatch.id,
        previewId: fashionFinalist,
        decision: fashionFinalist === fashionBatch.recommendedPreviewId ? "accept_recommended" : "customer_override",
        expectedRevision: fashionBatch.revision,
      });
      setFashionBatch(selection.batch);
      await api.createV2FashionPreviews({
        consultationId: consultation.id,
        idempotencyKey: `mobile-fashion-selection:${consultation.id}:${fashionFinalist}`,
        stylingSessionIds: [fashionFinalist],
        selectedStylingSessionId: fashionFinalist,
      });
      await load(consultation.id);
    } catch (error) {
      setMessage(
        mapMobileUserError(error, "패션 최종 룩을 저장하지 못했습니다."),
      );
    } finally {
      setLoading(false);
    }
  };

  const createAftercare = async () => {
    if (!consultation || serviceTypes.length === 0 || !serviceDate) return;
    setLoading(true);
    setMessage(null);
    try {
      const response = await api.createV2Aftercare({
        consultationId: consultation.id,
        idempotencyKey: `mobile-aftercare:${consultation.id}:${serviceDate}:${serviceTypes.slice().sort().join("-")}`,
        services: serviceTypes,
        serviceDate,
        today: [],
        checkpoints: [],
        concerns: [],
        satisfaction: null,
      });
      setAftercare(response.program);
      await load(consultation.id);
    } catch (error) {
      setMessage(
        mapMobileUserError(
          error,
          "실제 시술 기반 애프터케어를 만들지 못했습니다.",
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  const cycleLandmark = () => {
    const landmarks = evidence?.evidence.landmarks ?? [];
    if (!landmarks.length) return;
    const currentIndex = landmarks.findIndex(
      (item) => item.id === selectedLandmarkId,
    );
    setSelectedLandmarkId(landmarks[(currentIndex + 1) % landmarks.length].id);
  };

  const correctLandmark = async (
    deltaX: number,
    deltaY: number,
    restore = false,
  ) => {
    if (!consultation || !evidence || !selectedLandmarkId) return;
    const landmark = evidence.evidence.landmarks.find(
      (item) => item.id === selectedLandmarkId,
    );
    if (!landmark) return;
    const current = effectiveEvidencePointV2(
      evidence.evidence,
      "landmark",
      landmark.id,
      0,
      landmark.point,
    );
    setLoading(true);
    try {
      const response = await api.correctV2AnalysisEvidence({
        consultationId: consultation.id,
        expectedRevision: evidence.evidence.correctionRevision,
        targetType: "landmark",
        targetId: landmark.id,
        pointIndex: 0,
        adjustedPoint: restore
          ? landmark.point
          : {
              ...current,
              x: Math.max(0, Math.min(1, current.x + deltaX)),
              y: Math.max(0, Math.min(1, current.y + deltaY)),
            },
      });
      setEvidence({ ...evidence, evidence: response.evidence });
      setMessage(
        `AI 원본 좌표를 보존하고 사용자 보정 리비전 ${response.evidence.correctionRevision}을 저장했습니다.`,
      );
    } catch (error) {
      setMessage(
        mapMobileUserError(error, "랜드마크 좌표를 저장하지 못했습니다."),
      );
    } finally {
      setLoading(false);
    }
  };

  if (!isLoaded || (loading && !consultation)) {
    return (
      <AppScreen>
        <Card>
          <BodyText>AI 상담 상태를 불러오는 중...</BodyText>
        </Card>
      </AppScreen>
    );
  }

  if (!consultation) {
    return (
      <AppScreen>
        <Panel>
          <Stack>
            <Kicker>HairFit AI Consultant</Kicker>
            <Heading>헤어 생성이 아니라 결정 가능한 상담을 시작하세요</Heading>
            <BodyText>
              사진 검사, AI 얼굴 근거, 3×3 프리뷰, 비교와 확정을 하나의 서버
              세션으로 이어갑니다.
            </BodyText>
            {message ? <BodyText>{message}</BodyText> : null}
            <Button onPress={() => void create()}>새 AI 상담 시작</Button>
          </Stack>
        </Panel>
      </AppScreen>
    );
  }

  const acceptedVariants =
    board?.variants.filter((variant) => acceptedImage(board, variant.id)) ?? [];
  const primaryHairVariant = board?.variants.find(
    (variant) => variant.id === hairRecommendation?.primaryPreviewId,
  );
  const primaryHairImage = primaryHairVariant
    ? acceptedImage(board!, primaryHairVariant.id)
    : null;
  const photoRoute =
    `/upload?consultationId=${encodeURIComponent(consultation.id)}` as const;
  const generationRoute =
    `/generate?consultationId=${encodeURIComponent(consultation.id)}` as const;
  const canOpenGeneration = Boolean(
    consultation.analysisEvidenceId && !consultation.sourceGenerationId,
  );
  const outputsReady = Boolean(consultation.selectedSnapshotId);
  const completedFashionTopics = FASHION_TOPICS.filter(
    (topic) => fashionDirection?.fieldProvenance?.[`topic:${topic}`],
  );
  const discoveryConfirmed = Boolean(
    workspace?.completedStages.includes("discovery"),
  );
  const chapterPresentation = workspace
    ? deriveConsultationChapterPresentation(workspace, workspace.currentStage)
    : null;
  const reportHairSection = report?.tabs.flatMap((tab) => tab.sections)
    .find((section) => section.key === "candidate-comparison");
  const reportFashionSection = report?.tabs.flatMap((tab) => tab.sections)
    .find((section) => section.key === "fashion-result");

  return (
    <AppScreen>
      <Panel>
        <Stack>
          <Cluster>
            <Chip tone="success">V2</Chip>
            <Chip>{stateLabel(consultation.state)}</Chip>
            {chapterPresentation
              ? CONSULTATION_CHAPTERS.map((chapter) => {
                  const state = chapterPresentation.chapters.find(
                    (item) => item.id === chapter,
                  )!;
                  return (
                    <Chip
                      key={chapter}
                      tone={state.status === "complete" ? "success" : undefined}
                    >
                      {chapter} · {state.status}
                    </Chip>
                  );
                })
              : null}
          </Cluster>
          <Kicker>HairFit AI Consultant</Kicker>
          <Heading>상담 이어하기</Heading>
          <BodyText>
            세션 {consultation.id.slice(0, 8)} · 서버 snapshot{" "}
            {workspace?.version ?? consultation.version}
          </BodyText>
          <BodyText>
            {chapterPresentation
              ? `추천 작업 · ${chapterPresentation.recommendedTask.label}`
              : "서버 상담 상태를 불러오고 있습니다."}{" "}
            Web과 Expo가 같은 consultation ID와 서버 snapshot을 사용합니다.
          </BodyText>
          <Button
            variant="secondary"
            onPress={() => void load(consultation.id)}
          >
            서버 상태 새로고침
          </Button>
        </Stack>
      </Panel>

      {message ? (
        <View accessibilityLiveRegion="assertive" accessibilityRole="alert">
          <Card>
            <BodyText>{message}</BodyText>
          </Card>
        </View>
      ) : null}

      {!discoveryConfirmed ? (
        <Panel>
          <Stack>
            <Kicker>상담 시작 · 입력 0개</Kicker>
            <Heading style={styles.sectionHeading}>
              사진을 먼저 보고 필요한 것만 물어볼게요
            </Heading>
            <BodyText>
              지금 정하기 어려운 취향이나 모질을 먼저 묻지 않습니다. 사진 제출 후
              AI가 얼굴과 보이는 모발 특성을 분석하고, 추천에 꼭 필요한 내용만 최대
              2개 질문으로 확인합니다.
            </BodyText>
            <Button
              onPress={() => void startPhotoDiagnosis()}
            >
              사진으로 바로 진단 시작
            </Button>
            <Button variant="secondary" onPress={() => setOpeningIntentOpen((current) => !current)}>
              원하는 방향이 있다면 알려주기 (선택)
            </Button>
            {openingIntentOpen ? <Stack>
              <BodyText>하나만 선택해도 되고, 선택하지 않고 바로 시작해도 됩니다.</BodyText>
              <Cluster>{([
                ["leave_it_to_ai", "AI가 정해주세요"],
                ["tidy_current_impression", "현재 인상 정돈"],
                ["natural_change", "자연스러운 변화"],
                ["clear_change", "확실한 변화"],
              ] as const).map(([value, label]) => <Button key={value} variant={openingIntent === value ? "primary" : "secondary"} onPress={() => setOpeningIntent(value)}>{label}</Button>)}</Cluster>
              {openingIntent ? <Button onPress={() => void startPhotoDiagnosis()}>이 방향으로 사진 진단 시작</Button> : null}
            </Stack> : null}
          </Stack>
        </Panel>
      ) : null}

      {evidence?.overlayEnabled ? (
        <Panel>
          <Stack>
            <Kicker>서버 AI 분석 근거</Kicker>
            <Heading style={styles.sectionHeading}>
              얼굴 랜드마크와 측정 근거
            </Heading>
            <NativeFaceEvidenceOverlay
              evidence={evidence.evidence}
              sourceImageUrl={evidence.sourceImageUrl}
            />
            <BodyText>{evidence.evidence.faceShape.summary}</BodyText>
            <BodyText>
              선택 기준점: {selectedLandmarkId ?? "없음"} · 보정 리비전{" "}
              {evidence.evidence.correctionRevision}
            </BodyText>
            <Cluster>
              <Button variant="secondary" onPress={cycleLandmark}>
                다음 기준점
              </Button>
              <Button
                variant="secondary"
                onPress={() => void correctLandmark(0, -0.005)}
              >
                위
              </Button>
              <Button
                variant="secondary"
                onPress={() => void correctLandmark(-0.005, 0)}
              >
                왼쪽
              </Button>
              <Button
                variant="secondary"
                onPress={() => void correctLandmark(0.005, 0)}
              >
                오른쪽
              </Button>
              <Button
                variant="secondary"
                onPress={() => void correctLandmark(0, 0.005)}
              >
                아래
              </Button>
              <Button
                variant="secondary"
                onPress={() => void correctLandmark(0, 0, true)}
              >
                AI 원본
              </Button>
            </Cluster>
            <BodyText>
              사용자 보정은 표시 좌표에만 적용되며 AI 원본 좌표는 감사 이력으로
              보존됩니다.
            </BodyText>
          </Stack>
        </Panel>
      ) : null}

      {hairDiagnosis?.profile ? (
        <Panel>
          <Stack>
            <Kicker>
              AI 모질 관찰 · revision {hairDiagnosis.profile.revision}
            </Kicker>
            <Heading style={styles.sectionHeading}>
              사진으로 보이는 것과 확인이 필요한 것을 구분했습니다
            </Heading>
            {hairDiagnosis.profile.observed.map((item) => (
              <BodyText key={item.id}>
                {item.traitId} · {item.value} · 신뢰도{" "}
                {Math.round(item.confidence * 100)}%
              </BodyText>
            ))}
            {hairDiagnosis.profile.unknownFieldIds.length ? (
              <BodyText>
                사진 미확인 · {hairDiagnosis.profile.unknownFieldIds.join(", ")}
              </BodyText>
            ) : null}
            {hairDiagnosis.questions
              .filter((item) => item.state === "visible")
              .slice(0, 4)
              .map((question) => (
                <Card key={question.id}>
                  <Stack>
                    <BodyText>{question.prompt}</BodyText>
                    <Cluster>
                      {question.options.map((option) => (
                        <Button
                          key={option.value}
                          variant="secondary"
                          onPress={() =>
                            void answerHairQuestion(question, option.value)
                          }
                        >
                          {option.label}
                        </Button>
                      ))}
                    </Cluster>
                    <Button
                      variant="secondary"
                      onPress={() =>
                        void answerHairQuestion(question, null, "unknown")
                      }
                    >
                      잘 모르겠어요
                    </Button>
                  </Stack>
                </Card>
              ))}
            <BodyText>
              사진 관찰만으로 모공·탄력·내부 손상이나 시술 안전을 진단하지
              않습니다.
            </BodyText>
          </Stack>
        </Panel>
      ) : null}

      {personalColorProfile ? (
        <NativePersonalColorProfileV2
          profile={personalColorProfile}
          trainingConsent={trainingConsent}
          onTrainingConsentChange={(granted) =>
            void changeTrainingConsent(granted)
          }
        />
      ) : null}

      {discoveryConfirmed && !consultation.analysisEvidenceId ? (
        <Panel>
          <Stack>
            <Kicker>Photo quality</Kicker>
            <Heading style={styles.sectionHeading}>
              사진 업로드와 AI 분석
            </Heading>
            <BodyText>
              기기 기본 검사를 통과한 사진만 서버 사전검사와 얼굴 랜드마크
              분석으로 보냅니다.
            </BodyText>
            <Button onPress={() => router.push(photoRoute)}>
              사진 선택·분석
            </Button>
          </Stack>
        </Panel>
      ) : null}

      {canOpenGeneration ? (
        <Panel>
          <Stack>
            <Kicker>3×3 preview</Kicker>
            <Heading style={styles.sectionHeading}>
              분석 근거로 프리뷰 생성
            </Heading>
            <BodyText>
              AI 분석이 완료되었습니다. 최신 이용 조건을 확인하고 서버 생성
              작업을 접수하세요.
            </BodyText>
            <Button onPress={() => router.push(generationRoute)}>
              3×3 생성 접수
            </Button>
          </Stack>
        </Panel>
      ) : null}

      {board && hairRecommendation ? (
        <Panel>
          <Stack>
            <Cluster>
              <Chip>{hairRecommendation.state}</Chip>
              <Chip tone="success">생성 완료 {board.acceptedCount} / 9</Chip>
            </Cluster>
            <Kicker>AI primary · all nine results</Kicker>
            <Heading style={styles.sectionHeading}>
              AI 주 추천과 생성 결과 전체
            </Heading>
            <BodyText>
              AI가 가장 적합한 한 가지를 먼저 설명합니다. 나머지 결과를
              직접 추릴 필요는 없지만, 생성된 9개는 모두 확인할 수 있습니다.
            </BodyText>
            {primaryHairImage && primaryHairVariant ? (
              <Card>
                <Image
                  accessibilityLabel={`AI 주 추천 헤어 프리뷰 ${primaryHairVariant.slot}`}
                  source={{ uri: primaryHairImage }}
                  style={styles.primaryPreviewImage}
                />
                <Kicker>AI primary · option {primaryHairVariant.slot}</Kicker>
                <Heading style={styles.briefHeading}>
                  가장 잘 맞는 헤어 방향
                </Heading>
                <BodyText>
                  얼굴 균형, 모질 관측, 관리 조건과 이미지 품질을 함께 평가한
                  결과입니다.
                </BodyText>
              </Card>
            ) : (
              <Card>
                <BodyText>
                  9개 생성과 품질 승인이 끝나면 AI 주 추천을 표시합니다.
                </BodyText>
              </Card>
            )}

            {hairRecommendation.state === "clarification-required" &&
            hairRecommendation.clarification ? (
              <Card>
                <Heading style={styles.briefHeading}>
                  {hairRecommendation.clarification.prompt}
                </Heading>
                <BodyText>
                  답변은 이미 생성한 9개의 추천 순위에 한 번만 반영됩니다.
                </BodyText>
                {hairRecommendation.clarification.answerOptions.map((answer) => (
                  <Button
                    key={answer}
                    variant="secondary"
                    onPress={() => void answerHairClarification(answer)}
                  >
                    {answer}
                  </Button>
                ))}
              </Card>
            ) : null}

            <Heading style={styles.briefHeading}>생성 내용 전체</Heading>
            <View style={styles.grid} accessibilityLabel="헤어 생성 결과 9개 전체">
              {board.variants.map((variant) => {
                const imageUrl = acceptedImage(board, variant.id);
                const primary =
                  variant.id === hairRecommendation.primaryPreviewId;
                return (
                  <View
                    key={variant.id}
                    style={[
                      styles.previewCard,
                      primary && styles.previewCardSelected,
                      !imageUrl && styles.previewCardDisabled,
                    ]}
                  >
                    {imageUrl ? (
                      <Image
                        accessibilityLabel={`헤어 생성 결과 ${variant.slot}${primary ? ", AI 주 추천" : ""}`}
                        source={{ uri: imageUrl }}
                        style={styles.previewImage}
                      />
                    ) : (
                      <View style={styles.previewPlaceholder}>
                        <Text style={styles.previewLabel}>
                          {variant.status === "generating"
                            ? "생성·품질 확인 중"
                            : "결과 대기 중"}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.previewLabel}>
                      OPTION {variant.slot}
                      {primary ? " · AI PRIMARY" : ""}
                    </Text>
                  </View>
                );
              })}
            </View>

            {hairRecommendation.state === "primary-ready" ? (
              <Button onPress={() => void confirmHairRecommendation()}>
                AI 주 추천으로 진행
              </Button>
            ) : null}

            {["primary-ready", "adjustment-requested"].includes(
              hairRecommendation.state,
            ) ? (
              <Card>
                <Heading style={styles.briefHeading}>
                  마음에 걸리는 점 조정
                </Heading>
                <Cluster>
                  {HAIR_ADJUSTMENT_OPTIONS.map((item) => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{
                        selected: hairAdjustmentAspect === item.aspect,
                      }}
                      key={item.aspect}
                      onPress={() => setHairAdjustmentAspect(item.aspect)}
                      style={[
                        styles.adjustmentChip,
                        hairAdjustmentAspect === item.aspect &&
                          styles.adjustmentChipSelected,
                      ]}
                    >
                      <Text style={styles.adjustmentChipText}>{item.label}</Text>
                    </Pressable>
                  ))}
                </Cluster>
                <TextInput
                  accessibilityLabel="원하는 헤어 조정"
                  multiline
                  onChangeText={setHairAdjustmentValue}
                  placeholder="예: 앞머리는 없애고 얼굴 옆선을 조금 더 가려주세요."
                  style={styles.adjustmentInput}
                  value={hairAdjustmentValue}
                />
                <Button
                  disabled={!hairAdjustmentValue.trim()}
                  variant="secondary"
                  onPress={() => void requestHairAdjustment()}
                >
                  새 추천 요청
                </Button>
              </Card>
            ) : null}
          </Stack>
        </Panel>
      ) : board ? (
        <Panel>
          <Stack>
            <Cluster>
              <Chip>{board.state}</Chip>
              <Chip tone="success">품질 통과 {board.acceptedCount} / 9</Chip>
            </Cluster>
            <Kicker>3×3 board</Kicker>
            <Heading style={styles.sectionHeading}>
              품질 통과 프리뷰 비교
            </Heading>
            <View style={styles.grid}>
              {board.variants.map((variant) => {
                const imageUrl = acceptedImage(board, variant.id);
                const active = shortlist.includes(variant.id);
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{
                      disabled: !imageUrl,
                      selected: active,
                    }}
                    disabled={!imageUrl}
                    key={variant.id}
                    onPress={() => toggleShortlist(variant.id)}
                    style={[
                      styles.previewCard,
                      active && styles.previewCardSelected,
                      !imageUrl && styles.previewCardDisabled,
                    ]}
                  >
                    {imageUrl ? (
                      <Image
                        accessibilityLabel={`프리뷰 ${variant.slot}`}
                        source={{ uri: imageUrl }}
                        style={styles.previewImage}
                      />
                    ) : (
                      <View style={styles.previewPlaceholder}>
                        <Text style={styles.previewLabel}>
                          {variant.status === "generating" ? "생성 중" : "대기"}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.previewLabel}>
                      {variant.slot} · {variant.bucket}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <BodyText>
              완료된 결과 중 2~3개를 선택합니다. 현재 {shortlist.length}개.
            </BodyText>
            <Button
              disabled={shortlist.length < 2 || shortlist.length > 3}
              onPress={() => void saveShortlist()}
            >
              후보 비교 저장
            </Button>
          </Stack>
        </Panel>
      ) : consultation.sourceGenerationId ? (
        <Card>
          <BodyText>
            3×3 프리뷰 보드를 준비하고 있습니다. 잠시 후 서버 상태를 새로고침해
            주세요.
          </BodyText>
        </Card>
      ) : null}

      {!hairRecommendation && consultation.state === "shortlisted" && board ? (
        <Panel>
          <Stack>
            <Kicker>Final decision</Kicker>
            <Heading style={styles.sectionHeading}>
              최종 헤어 한 개 선택
            </Heading>
            {acceptedVariants
              .filter((variant) => shortlist.includes(variant.id))
              .map((variant) => (
                <Button
                  key={variant.id}
                  variant={finalistId === variant.id ? "primary" : "secondary"}
                  onPress={() => setFinalistId(variant.id)}
                >
                  프리뷰 {variant.slot}
                  {finalistId === variant.id ? " · 최종 후보" : ""}
                </Button>
              ))}
            <Button
              disabled={!finalistId}
              onPress={() => void draftSelection()}
            >
              최종 후보 검토
            </Button>
          </Stack>
        </Panel>
      ) : null}

      {!hairRecommendation && consultation.state === "style_selected" && selection ? (
        <Panel>
          <Stack>
            <Kicker>Confirmation</Kicker>
            <Heading style={styles.sectionHeading}>
              {selection.style.name}
            </Heading>
            <BodyText>{selection.style.recommendationReason}</BodyText>
            <BodyText>
              확정 후에는 같은 상담에서 선택을 바꿀 수 없습니다.
            </BodyText>
            <Button onPress={() => void confirmSelection()}>
              이 헤어로 확정
            </Button>
          </Stack>
        </Panel>
      ) : null}

      {outputsReady ? (
        <Panel>
          <Stack>
            <Kicker>Salon brief · AI output</Kicker>
            <Heading style={styles.sectionHeading}>
              확정 스냅샷에서 자동 준비한 시술 브리프
            </Heading>
            {brief ? (
              <Card>
                <Heading style={styles.briefHeading}>{brief.summary}</Heading>
                <BodyText>커트: {JSON.stringify(brief.cut)}</BodyText>
                <BodyText>
                  볼륨·텍스처: {JSON.stringify(brief.volumeTexture)}
                </BodyText>
                {brief.styling.map((item) => (
                  <BodyText key={item}>스타일링 · {item}</BodyText>
                ))}
                {brief.cautions.map((caution) => (
                  <BodyText key={caution}>주의 · {caution}</BodyText>
                ))}
              </Card>
            ) : (
              <BodyText>
                서버에서 브리프를 준비하고 있습니다. 별도 생성 요청은 필요하지
                않습니다.
              </BodyText>
            )}
          </Stack>
        </Panel>
      ) : null}

      {outputsReady && makeup ? (
        <NativeMakeupDirectionV1
          snapshot={makeup.snapshot}
          defaultContext={makeup.defaultContext}
          revision={makeup.revision}
          routine={makeup.routine}
          brief={makeup.brief}
          onPrepare={(context) => void prepareMakeup(context)}
          onToggleModule={(module, enabled) =>
            void toggleMakeupModule(module, enabled)
          }
          onConfirm={() => void confirmMakeup()}
        />
      ) : null}

      {outputsReady && makeup?.simulationEnabled && makeup.simulation.run ? (
        <Panel>
          <Stack>
            <Kicker>
              Makeup simulation · {makeup.simulation.workspaceState}
            </Kicker>
            <Heading style={styles.sectionHeading}>
              확정 메이크업 예상 이미지
            </Heading>
            {makeup.simulation.outputs.map((output) =>
              output.imageUrl ? (
                <Image
                  key={output.id}
                  accessibilityLabel="확정 메이크업 예상 이미지"
                  source={{ uri: output.imageUrl }}
                  style={styles.previewImage}
                />
              ) : null,
            )}
            <BodyText>
              {makeup.simulation.selection
                ? "확정된 시뮬레이션입니다."
                : "서버에서 생성·품질 확인 중입니다. 새로고침하면 최신 상태를 불러옵니다."}
            </BodyText>
            <BodyText>
              예상 이미지는 실제 피부·제품 발색 결과를 보장하지 않습니다.
            </BodyText>
          </Stack>
        </Panel>
      ) : null}

      {outputsReady &&
      fashionDirection &&
      (!makeup?.simulationEnabled || Boolean(makeup.simulation.selection)) ? (
        <Panel>
          <Stack>
            <Kicker>
              Fashion interview · {completedFashionTopics.length}/7
            </Kicker>
            <Heading style={styles.sectionHeading}>
              확정 헤어와 컬러에 이어질 패션 방향
            </Heading>
            <BodyText>
              단계형 마법사가 아니라 아직 저장되지 않은 주제만 바로 선택합니다.
              단일 선택은 서버 snapshot에 즉시 저장됩니다.
            </BodyText>
            <BodyText>착용 상황</BodyText>
            <Cluster>
              {(["daily", "work", "date", "formal"] as const).map((value) => (
                <Button
                  key={value}
                  variant={
                    fashionDirection.situation === value
                      ? "primary"
                      : "secondary"
                  }
                  onPress={() => {
                    const next = { ...fashionDirection, situation: value };
                    setFashionDirection(next);
                    void saveFashionTopic("context", next);
                  }}
                >
                  {value}
                </Button>
              ))}
            </Cluster>
            <BodyText>분위기</BodyText>
            <Cluster>
              {["minimal", "casual", "classic", "street", "office", "date"].map(
                (value) => (
                  <Button
                    key={value}
                    variant={
                      fashionDirection.genre === value ? "primary" : "secondary"
                    }
                    onPress={() => {
                      const next = { ...fashionDirection, genre: value };
                      setFashionDirection(next);
                      void saveFashionTopic("impression", next);
                    }}
                  >
                    {value}
                  </Button>
                ),
              )}
            </Cluster>
            <BodyText>핏</BodyText>
            <Cluster>
              {(["slim", "regular", "relaxed", "oversized"] as const).map(
                (value) => (
                  <Button
                    key={value}
                    variant={
                      fashionDirection.fit === value ? "primary" : "secondary"
                    }
                    onPress={() => {
                      const next = { ...fashionDirection, fit: value };
                      setFashionDirection(next);
                      void saveFashionTopic("fit", next);
                    }}
                  >
                    {value}
                  </Button>
                ),
              )}
            </Cluster>
            <BodyText>노출·넥라인 범위</BodyText>
            <Cluster>
              {(["low", "balanced", "bold"] as const).map((value) => (
                <Button
                  key={value}
                  variant={
                    fashionDirection.exposure === value
                      ? "primary"
                      : "secondary"
                  }
                  onPress={() => {
                    const next = { ...fashionDirection, exposure: value };
                    setFashionDirection(next);
                    void saveFashionTopic("exposure", next);
                  }}
                >
                  {value}
                </Button>
              ))}
            </Cluster>
            <BodyText>계절</BodyText>
            <Cluster>
              {(
                ["spring", "summer", "autumn", "winter", "all-season"] as const
              ).map((value) => (
                <Button
                  key={value}
                  variant={
                    fashionDirection.season === value ? "primary" : "secondary"
                  }
                  onPress={() => {
                    const next = { ...fashionDirection, season: value };
                    setFashionDirection(next);
                    void saveFashionTopic("season", next);
                  }}
                >
                  {value}
                </Button>
              ))}
            </Cluster>
            <TextInput
              accessibilityLabel="패션 예산"
              value={fashionDirection.budget}
              onChangeText={(budget) =>
                setFashionDirection({ ...fashionDirection, budget })
              }
              onEndEditing={() =>
                void saveFashionTopic("budget", fashionDirection)
              }
              placeholder="예: 기존 옷 활용, 20만원 이내"
              style={styles.textInput}
            />
            <TextInput
              accessibilityLabel="피하고 싶은 패션 아이템"
              value={fashionDirection.avoidItems.join(", ")}
              onChangeText={(text) =>
                setFashionDirection({
                  ...fashionDirection,
                  avoidItems: text
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean),
                })
              }
              onEndEditing={() =>
                void saveFashionTopic("avoid", fashionDirection)
              }
              placeholder="예: 모자, 높은 굽"
              style={styles.textInput}
            />
            {!fashionBatch ? (
              <Button
                disabled={completedFashionTopics.length < 7}
                onPress={() => void prepareFashion()}
              >
                {fashionAdaptiveEnabled ? "AI 권장 3개 룩 자동 준비" : "이 방향으로 9개 룩 자동 준비"}
              </Button>
            ) : (
              <Cluster>
                <Chip>{fashionBatch.state}</Chip>
                <Chip tone="success">{fashionBatch.completedCount}/{fashionBatch.requestedCount} 완료</Chip>
                {["approved", "partial", "failed"].includes(
                  fashionBatch.state,
                ) ? (
                  <Button
                    variant="secondary"
                    onPress={() => void resumeFashion()}
                  >
                    미완료 룩 다시 접수
                  </Button>
                ) : null}
                {fashionAdaptiveEnabled && fashionBatch.terminalCount === fashionBatch.requestedCount && fashionBatch.requestedCount < 9 ? (
                  <Button variant="secondary" onPress={() => void expandFashion()}>
                    3개 더 생성해서 모두 보기
                  </Button>
                ) : null}
              </Cluster>
            )}
            <BodyText>
              별도의 유료 생성 확인 화면 없이 서버가 이용 권한과 멱등성을
              검증합니다.
            </BodyText>
          </Stack>
        </Panel>
      ) : null}

      {fashionPreviews.length ? (
        <Panel>
          <Stack>
            <Kicker>Fashion AI output</Kicker>
            <Heading style={styles.sectionHeading}>
              요청한 {fashionBatch?.requestedCount ?? fashionPreviews.length}개 생성 내용을 모두 보여드려요
            </Heading>
            <BodyText>완료·생성 중·실패 상태를 숨기지 않으며 AI 권장안은 먼저 선택되어 있습니다.</BodyText>
            <View style={styles.grid}>
              {fashionPreviews.map((preview) => {
                const active = fashionFinalist === preview.stylingSessionId;
                const final = fashionFinalist === preview.stylingSessionId;
                const recommended = fashionBatch?.recommendedPreviewId === preview.stylingSessionId;
                return (
                  <Pressable
                    key={preview.stylingSessionId}
                    accessibilityRole="button"
                    accessibilityState={{
                      disabled: preview.status !== "completed",
                      selected: active,
                    }}
                    disabled={preview.status !== "completed"}
                    onPress={() => {
                      setFashionShortlist([preview.stylingSessionId]);
                      setFashionFinalist(preview.stylingSessionId);
                    }}
                    style={[
                      styles.previewCard,
                      active && styles.previewCardSelected,
                    ]}
                  >
                    {preview.imageUrl ? (
                      <Image
                        accessibilityLabel={preview.headline}
                        source={{ uri: preview.imageUrl }}
                        style={styles.previewImage}
                      />
                    ) : (
                      <View style={styles.previewPlaceholder}>
                        <Text style={styles.previewLabel}>
                          {preview.status}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.previewLabel}>{preview.headline}</Text>
                    {recommended ? <Chip tone="success">AI 권장</Chip> : null}
                    {active ? <Chip>{final ? "확정 예정" : "선택"}</Chip> : null}
                  </Pressable>
                );
              })}
            </View>
            <Button
              disabled={
                !fashionFinalist
              }
              onPress={() => void saveFashionSelection()}
            >
              패션 최종 선택 저장
            </Button>
          </Stack>
        </Panel>
      ) : null}

      {fashionFinalist && fashionShortlist.includes(fashionFinalist) ? (
        <Panel>
          <Stack>
            <Kicker>Result · Final synthesis</Kicker>
            <Heading style={styles.sectionHeading}>
              헤어·컬러·메이크업·패션 최종안
            </Heading>
            <BodyText>
              확정 헤어 {selection?.style.name ?? "서버 확정안"}
            </BodyText>
            <BodyText>
              퍼스널 컬러{" "}
              {personalColorProfile?.seasonalPosterior[0]?.type ??
                "분석 프로필"}{" "}
              · Makeup{" "}
              {makeup?.snapshot?.status === "confirmed" ||
              makeup?.snapshot?.status === "routine_ready" ||
              makeup?.snapshot?.status === "brief_ready"
                ? "확정"
                : "진행 중"}
            </BodyText>
            <BodyText>
              패션 최종 룩{" "}
              {fashionPreviews.find(
                (item) => item.stylingSessionId === fashionFinalist,
              )?.headline ?? fashionFinalist}
            </BodyText>
            <BodyText>
              각 결과는 같은 active Personal Color profile과 서버 snapshot
              provenance를 사용합니다.
            </BodyText>
            {report ? (
              <BodyText>
                Report v{report.provenance.reportRevision} · 무결성 {report.provenance.fingerprint}
              </BodyText>
            ) : null}
            {reportHairSection?.key === "candidate-comparison" ? (
              <Stack>
                <Heading style={styles.sectionHeading}>Hair 생성 결과 9개 전체</Heading>
                <BodyText>
                  {reportHairSection.payload.candidates.length}/{reportHairSection.payload.requestedCount}개를 숨김없이 표시합니다.
                </BodyText>
                <View style={styles.grid} accessibilityLabel="리포트 Hair 생성 결과 전체">
                  {reportHairSection.payload.candidates.map((candidate) => (
                    <View key={candidate.id} style={styles.previewCard}>
                      {candidate.image.src ? (
                        <Image accessibilityLabel={candidate.image.alt} source={{ uri: candidate.image.src }} style={styles.previewImage} />
                      ) : (
                        <View style={styles.previewPlaceholder}><Text style={styles.previewLabel}>{candidate.generationState}</Text></View>
                      )}
                      <Text style={styles.previewLabel}>{candidate.label}</Text>
                      <Cluster>
                        {candidate.isPrimary ? <Chip tone="success">AI 주 추천</Chip> : null}
                        {candidate.isConfirmed ? <Chip>고객 확정</Chip> : null}
                      </Cluster>
                    </View>
                  ))}
                </View>
              </Stack>
            ) : null}
            {reportFashionSection?.key === "fashion-result" ? (
              <Stack>
                <Heading style={styles.sectionHeading}>Fashion 생성 결과 전체</Heading>
                <BodyText>
                  {reportFashionSection.payload.looks.length}/{reportFashionSection.payload.requestedCount}개를 상태와 함께 표시합니다.
                </BodyText>
                <View style={styles.grid} accessibilityLabel="리포트 Fashion 생성 결과 전체">
                  {reportFashionSection.payload.looks.map((look) => (
                    <View key={look.id} style={styles.previewCard}>
                      {look.image?.src ? (
                        <Image accessibilityLabel={look.image.alt} source={{ uri: look.image.src }} style={styles.previewImage} />
                      ) : (
                        <View style={styles.previewPlaceholder}><Text style={styles.previewLabel}>{look.generationState}</Text></View>
                      )}
                      <Text style={styles.previewLabel}>{look.label}</Text>
                      <Cluster>
                        {look.isRecommended ? <Chip tone="success">AI 권장</Chip> : null}
                        {look.isSelected ? <Chip>고객 확정</Chip> : null}
                      </Cluster>
                    </View>
                  ))}
                </View>
              </Stack>
            ) : null}
          </Stack>
        </Panel>
      ) : null}

      {outputsReady ? (
        <Panel>
          <Stack>
            <Kicker>Actual service · Aftercare</Kicker>
            <Heading style={styles.sectionHeading}>
              실제로 받은 시술을 기준으로 관리 프로그램을 만듭니다
            </Heading>
            {actualService ? (
              <BodyText>
                {actualService.serviceDate} ·{" "}
                {actualService.services.join(", ")} 시술 확정
              </BodyText>
            ) : (
              <>
                <BodyText>
                  헤어 선택만으로는 애프터케어를 만들지 않습니다. 실제 시술
                  종류와 날짜를 먼저 저장합니다.
                </BodyText>
                <Cluster>
                  {["커트", "펌", "염색", "클리닉"].map((service) => (
                    <Button
                      key={service}
                      variant={
                        serviceTypes.includes(service) ? "primary" : "secondary"
                      }
                      onPress={() =>
                        setServiceTypes((current) =>
                          current.includes(service)
                            ? current.filter((item) => item !== service)
                            : [...current, service],
                        )
                      }
                    >
                      {service}
                    </Button>
                  ))}
                </Cluster>
                <TextInput
                  accessibilityLabel="실제 시술 날짜"
                  value={serviceDate}
                  onChangeText={setServiceDate}
                  placeholder="YYYY-MM-DD"
                  style={styles.textInput}
                />
                <Button
                  disabled={serviceTypes.length === 0 || !serviceDate}
                  onPress={() => void createAftercare()}
                >
                  실제 시술 확정하고 관리 프로그램 자동 생성
                </Button>
              </>
            )}
            {aftercare ? (
              <Card>
                <Heading style={styles.briefHeading}>오늘 할 일</Heading>
                {aftercare.today.map((item) => (
                  <BodyText key={item}>· {item}</BodyText>
                ))}
                <Heading style={styles.briefHeading}>체크포인트</Heading>
                {aftercare.checkpoints.map((item) => (
                  <BodyText key={item.offset}>
                    {item.offset} · {item.action}
                  </BodyText>
                ))}
                {aftercare.concerns.map((item) => (
                  <BodyText key={item}>주의 · {item}</BodyText>
                ))}
              </Card>
            ) : actualService ? (
              <BodyText>
                저장된 실제 시술을 기준으로 AI 관리 프로그램을 복구 중입니다.
              </BodyText>
            ) : null}
          </Stack>
        </Panel>
      ) : null}

      <Button
        variant="secondary"
        onPress={() => {
          void clearActiveV2ConsultationId().then(() => {
            setConsultation(null);
            setWorkspace(null);
            setBoard(null);
            setHairRecommendation(null);
            setEvidence(null);
            setSelection(null);
          });
        }}
      >
        새 상담으로 전환
      </Button>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  adjustmentChip: {
    borderColor: "#34322c",
    borderRadius: 6,
    borderWidth: 1,
    minHeight: 44,
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  adjustmentChipSelected: { borderColor: "#d0b06a", borderWidth: 2 },
  adjustmentChipText: { color: "#f4f1e8", fontSize: 12, fontWeight: "800" },
  adjustmentInput: {
    backgroundColor: "#181713",
    borderColor: "#34322c",
    borderRadius: 6,
    borderWidth: 1,
    color: "#f4f1e8",
    minHeight: 96,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: "top",
  },
  briefHeading: { fontSize: 18, lineHeight: 24 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  previewCard: {
    backgroundColor: "#181713",
    borderColor: "#34322c",
    borderRadius: 6,
    borderWidth: 1,
    overflow: "hidden",
    width: "31%",
  },
  previewCardDisabled: { opacity: 0.58 },
  previewCardSelected: { borderColor: "#d0b06a", borderWidth: 2 },
  previewImage: { aspectRatio: 4 / 5, width: "100%" },
  previewLabel: {
    color: "#f4f1e8",
    fontSize: 10,
    fontWeight: "800",
    padding: 6,
  },
  previewPlaceholder: {
    alignItems: "center",
    aspectRatio: 4 / 5,
    backgroundColor: "#24231f",
    justifyContent: "center",
    width: "100%",
  },
  primaryPreviewImage: { aspectRatio: 4 / 5, width: "100%" },
  sectionHeading: { fontSize: 22, lineHeight: 28 },
  textInput: {
    backgroundColor: "#181713",
    borderColor: "#34322c",
    borderRadius: 6,
    borderWidth: 1,
    color: "#f4f1e8",
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});
