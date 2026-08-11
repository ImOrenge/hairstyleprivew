import { useAuth } from "@clerk/clerk-expo";
import type {
  AnalysisEvidenceV2,
  AftercareProgramV2,
  ConsultationSnapshot,
  ConsultationInputProfile,
  ConsultationSessionV2,
  FashionDirectionSnapshot,
  FashionPreviewBatch,
  FashionPreviewCandidateV2,
  PreviewBoardV2,
  SalonBriefV2,
  StyleSelectionSnapshotV2,
} from "@hairfit/shared";
import { effectiveEvidencePointV2 } from "@hairfit/shared";
import { BodyText, Button, Card, Chip, Cluster, Heading, Kicker, Panel, Stack } from "@hairfit/ui-native";
import * as Crypto from "expo-crypto";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AppScreen } from "../components/app/AppScreen";
import { NativeFaceEvidenceOverlay } from "../components/consulting/NativeFaceEvidenceOverlay";
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

const FASHION_TOPICS = ["context", "impression", "fit", "exposure", "season", "budget", "avoid"] as const;
const DISCOVERY_TOPICS = ["purpose", "goals", "current-hair", "history", "services", "maintenance", "change"] as const;

function acceptedImage(board: PreviewBoardV2, variantId: string) {
  const variant = board.variants.find((item) => item.id === variantId);
  return [...(variant?.attempts ?? [])].reverse().find(
    (attempt) => attempt.status === "accepted" && attempt.outputUrl,
  )?.outputUrl ?? null;
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
  const [consultation, setConsultation] = useState<ConsultationSessionV2 | null>(null);
  const [workspace, setWorkspace] = useState<ConsultationSnapshot | null>(null);
  const [discoveryDraft, setDiscoveryDraft] = useState<ConsultationInputProfile | null>(null);
  const [board, setBoard] = useState<PreviewBoardV2 | null>(null);
  const [evidence, setEvidence] = useState<EvidenceState | null>(null);
  const [selection, setSelection] = useState<StyleSelectionSnapshotV2 | null>(null);
  const [brief, setBrief] = useState<SalonBriefV2 | null>(null);
  const [aftercare, setAftercare] = useState<AftercareProgramV2 | null>(null);
  const [actualService, setActualService] = useState<ActualServiceState | null>(null);
  const [serviceTypes, setServiceTypes] = useState<string[]>([]);
  const [serviceDate, setServiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [fashionDirection, setFashionDirection] = useState<FashionDirectionSnapshot | null>(null);
  const [fashionBatch, setFashionBatch] = useState<FashionPreviewBatch | null>(null);
  const [fashionPreviews, setFashionPreviews] = useState<FashionPreviewCandidateV2[]>([]);
  const [fashionShortlist, setFashionShortlist] = useState<string[]>([]);
  const [fashionFinalist, setFashionFinalist] = useState<string | null>(null);
  const [shortlist, setShortlist] = useState<string[]>([]);
  const [finalistId, setFinalistId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedLandmarkId, setSelectedLandmarkId] = useState<string | null>(null);

  const load = useCallback(async (consultationId: string) => {
    setLoading(true);
    setMessage(null);
    try {
      const [workspaceResponse, response] = await Promise.all([
        api.getConsultation(consultationId),
        api.getV2Consultation(consultationId),
      ]);
      setWorkspace(workspaceResponse.snapshot);
      setDiscoveryDraft(workspaceResponse.snapshot.discovery);
      setFashionDirection(workspaceResponse.snapshot.fashion.directionSnapshot);
      const next = response.consultation;
      setConsultation(next);
      await saveActiveV2ConsultationId(next.id);

      const outputReady = Boolean(next.selectedSnapshotId);
      const [nextEvidence, nextBoard, nextShortlist, nextSelection, nextBrief, nextAftercare, nextFashion, nextFashionBatch] = await Promise.all([
        next.analysisEvidenceId
          ? api.getV2AnalysisEvidence(next.id).catch(() => null)
          : Promise.resolve(null),
        next.sourceGenerationId
          ? api.getV2PreviewBoard(next.id).catch(() => null)
          : Promise.resolve(null),
        ["shortlisted", "style_selected", "selection_confirmed", "salon_brief_ready", "aftercare_ready", "fashion_ready", "completed"].includes(next.state)
          ? api.getV2Shortlist(next.id).catch(() => null)
          : Promise.resolve(null),
        next.selectedSnapshotId
          ? api.getV2Selection(next.id).catch(() => null)
          : Promise.resolve(null),
        outputReady
          ? api.createV2SalonBrief(next.id, `mobile-brief:auto:${next.id}:${next.selectedSnapshotId}`).catch(() => null)
          : Promise.resolve(null),
        outputReady ? api.getV2Aftercare(next.id).catch(() => null) : Promise.resolve(null),
        outputReady ? api.getV2FashionPreviews(next.id).catch(() => null) : Promise.resolve(null),
        outputReady ? api.getV2FashionBatch(next.id).catch(() => null) : Promise.resolve(null),
      ]);
      setEvidence(nextEvidence);
      setSelectedLandmarkId((current) => current && nextEvidence?.evidence.landmarks.some((item) => item.id === current)
        ? current
        : nextEvidence?.evidence.landmarks[0]?.id ?? null);
      setBoard(nextBoard?.board ?? null);
      if (nextShortlist?.shortlist.previewVariantIds) {
        setShortlist(nextShortlist.shortlist.previewVariantIds);
      }
      setSelection(nextSelection?.selection ?? null);
      if (nextSelection?.selection) setFinalistId(nextSelection.selection.previewVariantId);
      setBrief(nextBrief?.brief ?? null);
      setAftercare(nextAftercare?.program ?? null);
      setActualService(nextAftercare?.actualService ?? null);
      setFashionPreviews(nextFashion?.previews ?? []);
      setFashionBatch(nextFashionBatch?.batch ?? null);
      if (nextFashion?.previewSet) {
        setFashionShortlist(nextFashion.previewSet.stylingSessionIds);
        setFashionFinalist(nextFashion.previewSet.selectedStylingSessionId);
      }
    } catch (error) {
      setMessage(mapMobileUserError(error, "진행 중인 AI 상담을 불러오지 못했습니다."));
    } finally {
      setLoading(false);
    }
  }, [api]);

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
    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, load, router]);

  useEffect(() => {
    if (!consultation || !fashionBatch || !["approved", "generating", "partial"].includes(fashionBatch.state)) return;
    const timer = setInterval(() => {
      void Promise.all([
        api.reconcileV2FashionBatch(consultation.id, fashionBatch.id),
        api.getV2FashionPreviews(consultation.id),
      ]).then(([batchResponse, previewResponse]) => {
        setFashionBatch(batchResponse.batch);
        setFashionPreviews(previewResponse.previews);
      }).catch(() => undefined);
    }, 4_000);
    return () => clearInterval(timer);
  }, [api, consultation, fashionBatch]);

  const create = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await api.createConsultation(`mobile-consulting:${Crypto.randomUUID()}`);
      await saveActiveV2ConsultationId(response.snapshot.sessionId);
      await load(response.snapshot.sessionId);
    } catch (error) {
      setMessage(mapMobileUserError(error, "새 AI 상담을 시작하지 못했습니다."));
    } finally {
      setLoading(false);
    }
  };

  const toggleShortlist = (variantId: string) => {
    if (!board || !acceptedImage(board, variantId)) return;
    setShortlist((current) => current.includes(variantId)
      ? current.filter((item) => item !== variantId)
      : current.length < 3 ? [...current, variantId] : current);
  };

  const saveShortlist = async () => {
    if (!consultation || shortlist.length < 2 || shortlist.length > 3) return;
    setLoading(true);
    try {
      await api.saveV2Shortlist(consultation.id, shortlist, consultation.version);
      await load(consultation.id);
    } catch (error) {
      setMessage(mapMobileUserError(error, "후보 비교 목록을 저장하지 못했습니다."));
      setLoading(false);
    }
  };

  const draftSelection = async () => {
    if (!consultation || !finalistId) return;
    setLoading(true);
    try {
      await api.selectV2Style(consultation.id, finalistId, consultation.version);
      await load(consultation.id);
    } catch (error) {
      setMessage(mapMobileUserError(error, "최종 헤어 선택을 저장하지 못했습니다."));
      setLoading(false);
    }
  };

  const confirmSelection = async () => {
    if (!consultation || !selection) return;
    setLoading(true);
    try {
      await api.confirmV2Style(consultation.id, selection.id, consultation.version);
      await load(consultation.id);
    } catch (error) {
      setMessage(mapMobileUserError(error, "최종 헤어를 확정하지 못했습니다."));
      setLoading(false);
    }
  };

  const saveDiscoveryTopic = async (
    topic: (typeof DISCOVERY_TOPICS)[number],
    fields: string[],
    nextDraft: ConsultationInputProfile,
  ) => {
    if (!workspace) return;
    setLoading(true);
    try {
      const normalized: ConsultationInputProfile = {
        ...nextDraft,
        fieldProvenance: {
          ...nextDraft.fieldProvenance,
          [`topic:${topic}`]: "user",
          ...Object.fromEntries(fields.map((field) => [field, "user"] as const)),
        },
        interviewRevision: (nextDraft.interviewRevision ?? 0) + 1,
      };
      const response = await api.updateConsultation(workspace.sessionId, {
        expectedVersion: workspace.version,
        discovery: normalized,
        currentStage: "discovery",
      });
      setWorkspace(response.snapshot);
      setDiscoveryDraft(response.snapshot.discovery);
      setMessage("상담 답변을 서버 snapshot에 저장했습니다.");
    } catch (error) {
      setMessage(mapMobileUserError(error, "상담 답변을 저장하지 못했습니다. 서버 상태를 다시 불러옵니다."));
      if (consultation) await load(consultation.id).catch(() => undefined);
    } finally {
      setLoading(false);
    }
  };

  const confirmDiscovery = async () => {
    if (!workspace || !discoveryDraft) return;
    setLoading(true);
    try {
      const response = await api.updateConsultation(workspace.sessionId, {
        expectedVersion: workspace.version,
        discovery: discoveryDraft,
        completeStage: "discovery",
        currentStage: "photo",
      });
      setWorkspace(response.snapshot);
      setMessage("상담 기준이 정리되었습니다. 사진 분석을 이어갈 수 있습니다.");
    } catch (error) {
      setMessage(mapMobileUserError(error, "상담 기준을 확정하지 못했습니다."));
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
      const field = topic === "context" ? "situation" : topic === "impression" ? "genre" : topic === "avoid" ? "avoidItems" : topic;
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
      setMessage(mapMobileUserError(error, "패션 방향을 저장하지 못했습니다. 서버 상태를 다시 불러옵니다."));
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
      setMessage(mapMobileUserError(error, "패션 9개 룩을 접수하지 못했습니다."));
    } finally {
      setLoading(false);
    }
  };

  const resumeFashion = async () => {
    if (!consultation || !fashionBatch) return;
    setLoading(true);
    try {
      await api.dispatchV2FashionBatch(consultation.id, fashionBatch.id);
      await load(consultation.id);
    } catch (error) {
      setMessage(mapMobileUserError(error, "미완료 패션 룩을 다시 접수하지 못했습니다."));
    } finally {
      setLoading(false);
    }
  };

  const saveFashionSelection = async () => {
    if (!consultation || !fashionFinalist || fashionShortlist.length < 2 || fashionShortlist.length > 3) return;
    setLoading(true);
    try {
      await api.createV2FashionPreviews({
        consultationId: consultation.id,
        idempotencyKey: `mobile-fashion-selection:${consultation.id}:${fashionFinalist}`,
        stylingSessionIds: fashionShortlist,
        selectedStylingSessionId: fashionFinalist,
      });
      await load(consultation.id);
    } catch (error) {
      setMessage(mapMobileUserError(error, "패션 최종 룩을 저장하지 못했습니다."));
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
      setMessage(mapMobileUserError(error, "실제 시술 기반 애프터케어를 만들지 못했습니다."));
    } finally {
      setLoading(false);
    }
  };

  const cycleLandmark = () => {
    const landmarks = evidence?.evidence.landmarks ?? [];
    if (!landmarks.length) return;
    const currentIndex = landmarks.findIndex((item) => item.id === selectedLandmarkId);
    setSelectedLandmarkId(landmarks[(currentIndex + 1) % landmarks.length].id);
  };

  const correctLandmark = async (deltaX: number, deltaY: number, restore = false) => {
    if (!consultation || !evidence || !selectedLandmarkId) return;
    const landmark = evidence.evidence.landmarks.find((item) => item.id === selectedLandmarkId);
    if (!landmark) return;
    const current = effectiveEvidencePointV2(evidence.evidence, "landmark", landmark.id, 0, landmark.point);
    setLoading(true);
    try {
      const response = await api.correctV2AnalysisEvidence({
        consultationId: consultation.id,
        expectedRevision: evidence.evidence.correctionRevision,
        targetType: "landmark",
        targetId: landmark.id,
        pointIndex: 0,
        adjustedPoint: restore ? landmark.point : {
          ...current,
          x: Math.max(0, Math.min(1, current.x + deltaX)),
          y: Math.max(0, Math.min(1, current.y + deltaY)),
        },
      });
      setEvidence({ ...evidence, evidence: response.evidence });
      setMessage(`AI 원본 좌표를 보존하고 사용자 보정 리비전 ${response.evidence.correctionRevision}을 저장했습니다.`);
    } catch (error) {
      setMessage(mapMobileUserError(error, "랜드마크 좌표를 저장하지 못했습니다."));
    } finally {
      setLoading(false);
    }
  };

  if (!isLoaded || loading && !consultation) {
    return <AppScreen><Card><BodyText>AI 상담 상태를 불러오는 중...</BodyText></Card></AppScreen>;
  }

  if (!consultation) {
    return <AppScreen><Panel><Stack><Kicker>HairFit AI Consultant</Kicker><Heading>헤어 생성이 아니라 결정 가능한 상담을 시작하세요</Heading><BodyText>사진 검사, AI 얼굴 근거, 3×3 프리뷰, 비교와 확정을 하나의 서버 세션으로 이어갑니다.</BodyText>{message ? <BodyText>{message}</BodyText> : null}<Button onPress={() => void create()}>새 AI 상담 시작</Button></Stack></Panel></AppScreen>;
  }

  const acceptedVariants = board?.variants.filter((variant) => acceptedImage(board, variant.id)) ?? [];
  const photoRoute = `/upload?consultationId=${encodeURIComponent(consultation.id)}` as const;
  const generationRoute = `/generate?consultationId=${encodeURIComponent(consultation.id)}` as const;
  const canOpenGeneration = Boolean(consultation.analysisEvidenceId && !consultation.sourceGenerationId);
  const outputsReady = Boolean(consultation.selectedSnapshotId);
  const completedFashionTopics = FASHION_TOPICS.filter((topic) => fashionDirection?.fieldProvenance?.[`topic:${topic}`]);
  const completedDiscoveryTopics = DISCOVERY_TOPICS.filter((topic) => discoveryDraft?.fieldProvenance?.[`topic:${topic}`]);
  const discoveryConfirmed = Boolean(workspace?.completedStages.includes("discovery"));

  return <AppScreen>
    <Panel><Stack><Cluster><Chip tone="success">V2</Chip><Chip>{stateLabel(consultation.state)}</Chip>{workspace ? <Chip>{workspace.journey.recommendedStage}</Chip> : null}</Cluster><Kicker>HairFit AI Consultant</Kicker><Heading>상담 이어하기</Heading><BodyText>세션 {consultation.id.slice(0, 8)} · 서버 snapshot {workspace?.version ?? consultation.version}</BodyText><BodyText>Web과 Expo가 같은 consultation ID와 서버 snapshot을 사용합니다. 앱을 종료해도 분석, 생성, 선택 상태를 다시 이어갑니다.</BodyText><Button variant="secondary" onPress={() => void load(consultation.id)}>서버 상태 새로고침</Button></Stack></Panel>

    {message ? <View accessibilityLiveRegion="assertive" accessibilityRole="alert"><Card><BodyText>{message}</BodyText></Card></View> : null}

    {!discoveryConfirmed && discoveryDraft ? <Panel><Stack><Kicker>Discovery interview · {completedDiscoveryTopics.length}/7</Kicker><Heading style={styles.sectionHeading}>필요한 기준만 대화하듯 정리해요</Heading><BodyText>순서가 잠긴 마법사가 아닙니다. 저장되지 않은 주제를 어느 순서로든 답하고, 단일 선택은 즉시 서버 snapshot에 저장합니다.</BodyText><BodyText>상담 목적</BodyText><Cluster>{["출근·업무 이미지", "일상 이미지 정리", "중요 일정", "큰 스타일 변화"].map((value) => <Button key={value} variant={discoveryDraft.purpose === value ? "primary" : "secondary"} onPress={() => { const next = { ...discoveryDraft, purpose: value }; setDiscoveryDraft(next); void saveDiscoveryTopic("purpose", ["purpose"], next); }}>{value}</Button>)}</Cluster><BodyText>원하는 변화</BodyText><Cluster>{["더 또렷한 인상", "부드러운 인상", "얼굴 균형 보완", "손질 시간 단축", "새로운 이미지"].map((value) => <Button key={value} variant={discoveryDraft.goals.includes(value) ? "primary" : "secondary"} onPress={() => setDiscoveryDraft({ ...discoveryDraft, goals: discoveryDraft.goals.includes(value) ? discoveryDraft.goals.filter((item) => item !== value) : [...discoveryDraft.goals, value] })}>{value}</Button>)}</Cluster><Button variant="secondary" disabled={discoveryDraft.goals.length === 0} onPress={() => void saveDiscoveryTopic("goals", ["goals"], discoveryDraft)}>원하는 변화 저장</Button><TextInput accessibilityLabel="현재 모발 상태" value={discoveryDraft.currentHair} onChangeText={(currentHair) => setDiscoveryDraft({ ...discoveryDraft, currentHair })} placeholder="예: 어깨 아래 길이, 끝부분 손상" style={styles.textInput} /><Cluster>{["짧음", "중간", "김"].map((value) => <Button key={value} variant={discoveryDraft.hairLength === value ? "primary" : "secondary"} onPress={() => setDiscoveryDraft({ ...discoveryDraft, hairLength: value })}>{value}</Button>)}</Cluster><Button variant="secondary" disabled={!discoveryDraft.currentHair.trim()} onPress={() => void saveDiscoveryTopic("current-hair", ["currentHair", "hairLength", "hairTexture", "hairDensity", "strandThickness"], discoveryDraft)}>현재 모발 저장</Button><BodyText>시술 이력과 손상</BodyText><Cluster>{["낮음", "보통", "높음", "잘 모르겠어요"].map((value) => <Button key={value} variant={discoveryDraft.damageLevel === value ? "primary" : "secondary"} onPress={() => setDiscoveryDraft({ ...discoveryDraft, damageLevel: value })}>{value}</Button>)}</Cluster><Cluster>{["탈색", "염색", "펌", "매직·스트레이트"].map((value) => <Button key={value} variant={discoveryDraft.treatmentHistory.includes(value) ? "primary" : "secondary"} onPress={() => setDiscoveryDraft({ ...discoveryDraft, treatmentHistory: discoveryDraft.treatmentHistory.includes(value) ? discoveryDraft.treatmentHistory.filter((item) => item !== value) : [...discoveryDraft.treatmentHistory, value] })}>{value}</Button>)}</Cluster><Button variant="secondary" onPress={() => void saveDiscoveryTopic("history", ["damageLevel", "treatmentHistory"], discoveryDraft)}>시술 이력 저장</Button><BodyText>가능한 시술 범위</BodyText><Cluster>{["커트", "펌", "염색", "클리닉"].map((value) => <Button key={value} variant={discoveryDraft.allowedServices.includes(value) ? "primary" : "secondary"} onPress={() => setDiscoveryDraft({ ...discoveryDraft, desiredServices: discoveryDraft.desiredServices.includes(value) ? discoveryDraft.desiredServices : [...discoveryDraft.desiredServices, value], allowedServices: discoveryDraft.allowedServices.includes(value) ? discoveryDraft.allowedServices.filter((item) => item !== value) : [...discoveryDraft.allowedServices, value] })}>{value}</Button>)}</Cluster><Button variant="secondary" disabled={discoveryDraft.allowedServices.length === 0} onPress={() => void saveDiscoveryTopic("services", ["desiredServices", "allowedServices"], discoveryDraft)}>시술 범위 저장</Button><BodyText>관리 가능 범위</BodyText><Cluster>{(["low", "medium", "high"] as const).map((value) => <Button key={value} variant={discoveryDraft.maintenanceLevel === value ? "primary" : "secondary"} onPress={() => setDiscoveryDraft({ ...discoveryDraft, maintenanceLevel: value })}>{value}</Button>)}</Cluster><Cluster>{[5, 10, 20, 30].map((value) => <Button key={value} variant={discoveryDraft.morningMinutes === value ? "primary" : "secondary"} onPress={() => setDiscoveryDraft({ ...discoveryDraft, morningMinutes: value })}>{value}분</Button>)}</Cluster><Button variant="secondary" onPress={() => void saveDiscoveryTopic("maintenance", ["maintenanceLevel", "morningMinutes", "heatStyling", "salonCycleWeeks"], discoveryDraft)}>관리 범위 저장</Button><BodyText>변화 강도와 회피 조건</BodyText><Cluster>{(["subtle", "moderate", "bold"] as const).map((value) => <Button key={value} variant={discoveryDraft.changeLevel === value ? "primary" : "secondary"} onPress={() => setDiscoveryDraft({ ...discoveryDraft, changeLevel: value })}>{value}</Button>)}</Cluster><Cluster>{["짧은 앞머리", "과한 볼륨", "강한 컬", "잦은 뿌리 염색", "매일 고데기"].map((value) => <Button key={value} variant={discoveryDraft.avoid.includes(value) ? "primary" : "secondary"} onPress={() => setDiscoveryDraft({ ...discoveryDraft, avoid: discoveryDraft.avoid.includes(value) ? discoveryDraft.avoid.filter((item) => item !== value) : [...discoveryDraft.avoid, value] })}>{value}</Button>)}</Cluster><TextInput accessibilityLabel="추가 상담 메모" value={discoveryDraft.notes} onChangeText={(notes) => setDiscoveryDraft({ ...discoveryDraft, notes })} placeholder="추가로 알려줄 내용" style={styles.textInput} /><Button variant="secondary" onPress={() => void saveDiscoveryTopic("change", ["changeLevel", "avoid", "notes"], discoveryDraft)}>변화 방향 저장</Button>{completedDiscoveryTopics.length === 7 ? <Button onPress={() => void confirmDiscovery()}>이 기준으로 사진 준비</Button> : <BodyText>아직 저장되지 않은 상담 주제 {7 - completedDiscoveryTopics.length}개</BodyText>}</Stack></Panel> : null}

    {evidence?.overlayEnabled ? <Panel><Stack><Kicker>서버 AI 분석 근거</Kicker><Heading style={styles.sectionHeading}>얼굴 랜드마크와 측정 근거</Heading><NativeFaceEvidenceOverlay evidence={evidence.evidence} sourceImageUrl={evidence.sourceImageUrl} /><BodyText>{evidence.evidence.faceShape.summary}</BodyText><BodyText>선택 기준점: {selectedLandmarkId ?? "없음"} · 보정 리비전 {evidence.evidence.correctionRevision}</BodyText><Cluster><Button variant="secondary" onPress={cycleLandmark}>다음 기준점</Button><Button variant="secondary" onPress={() => void correctLandmark(0, -0.005)}>위</Button><Button variant="secondary" onPress={() => void correctLandmark(-0.005, 0)}>왼쪽</Button><Button variant="secondary" onPress={() => void correctLandmark(0.005, 0)}>오른쪽</Button><Button variant="secondary" onPress={() => void correctLandmark(0, 0.005)}>아래</Button><Button variant="secondary" onPress={() => void correctLandmark(0, 0, true)}>AI 원본</Button></Cluster><BodyText>사용자 보정은 표시 좌표에만 적용되며 AI 원본 좌표는 감사 이력으로 보존됩니다.</BodyText></Stack></Panel> : null}

    {discoveryConfirmed && !consultation.analysisEvidenceId ? <Panel><Stack><Kicker>Photo quality</Kicker><Heading style={styles.sectionHeading}>사진 업로드와 AI 분석</Heading><BodyText>기기 기본 검사를 통과한 사진만 서버 사전검사와 얼굴 랜드마크 분석으로 보냅니다.</BodyText><Button onPress={() => router.push(photoRoute)}>사진 선택·분석</Button></Stack></Panel> : null}

    {canOpenGeneration ? <Panel><Stack><Kicker>3×3 preview</Kicker><Heading style={styles.sectionHeading}>분석 근거로 프리뷰 생성</Heading><BodyText>AI 분석이 완료되었습니다. 최신 이용 조건을 확인하고 서버 생성 작업을 접수하세요.</BodyText><Button onPress={() => router.push(generationRoute)}>3×3 생성 접수</Button></Stack></Panel> : null}

    {board ? <Panel><Stack><Cluster><Chip>{board.state}</Chip><Chip tone="success">품질 통과 {board.acceptedCount} / 9</Chip></Cluster><Kicker>3×3 board</Kicker><Heading style={styles.sectionHeading}>품질 통과 프리뷰 비교</Heading><View style={styles.grid}>{board.variants.map((variant) => { const imageUrl = acceptedImage(board, variant.id); const active = shortlist.includes(variant.id); return <Pressable accessibilityRole="button" accessibilityState={{ disabled: !imageUrl, selected: active }} disabled={!imageUrl} key={variant.id} onPress={() => toggleShortlist(variant.id)} style={[styles.previewCard, active && styles.previewCardSelected, !imageUrl && styles.previewCardDisabled]}>{imageUrl ? <Image accessibilityLabel={`프리뷰 ${variant.slot}`} source={{ uri: imageUrl }} style={styles.previewImage} /> : <View style={styles.previewPlaceholder}><Text style={styles.previewLabel}>{variant.status === "generating" ? "생성 중" : "대기"}</Text></View>}<Text style={styles.previewLabel}>{variant.slot} · {variant.bucket}</Text></Pressable>; })}</View><BodyText>완료된 결과 중 2~3개를 선택합니다. 현재 {shortlist.length}개.</BodyText><Button disabled={shortlist.length < 2 || shortlist.length > 3} onPress={() => void saveShortlist()}>후보 비교 저장</Button></Stack></Panel> : consultation.sourceGenerationId ? <Card><BodyText>3×3 프리뷰 보드를 준비하고 있습니다. 잠시 후 서버 상태를 새로고침해 주세요.</BodyText></Card> : null}

    {consultation.state === "shortlisted" && board ? <Panel><Stack><Kicker>Final decision</Kicker><Heading style={styles.sectionHeading}>최종 헤어 한 개 선택</Heading>{acceptedVariants.filter((variant) => shortlist.includes(variant.id)).map((variant) => <Button key={variant.id} variant={finalistId === variant.id ? "primary" : "secondary"} onPress={() => setFinalistId(variant.id)}>프리뷰 {variant.slot}{finalistId === variant.id ? " · 최종 후보" : ""}</Button>)}<Button disabled={!finalistId} onPress={() => void draftSelection()}>최종 후보 검토</Button></Stack></Panel> : null}

    {consultation.state === "style_selected" && selection ? <Panel><Stack><Kicker>Confirmation</Kicker><Heading style={styles.sectionHeading}>{selection.style.name}</Heading><BodyText>{selection.style.recommendationReason}</BodyText><BodyText>확정 후에는 같은 상담에서 선택을 바꿀 수 없습니다.</BodyText><Button onPress={() => void confirmSelection()}>이 헤어로 확정</Button></Stack></Panel> : null}

    {outputsReady ? <Panel><Stack><Kicker>Salon brief · AI output</Kicker><Heading style={styles.sectionHeading}>확정 스냅샷에서 자동 준비한 시술 브리프</Heading>{brief ? <Card><Heading style={styles.briefHeading}>{brief.summary}</Heading><BodyText>커트: {JSON.stringify(brief.cut)}</BodyText><BodyText>볼륨·텍스처: {JSON.stringify(brief.volumeTexture)}</BodyText>{brief.styling.map((item) => <BodyText key={item}>스타일링 · {item}</BodyText>)}{brief.cautions.map((caution) => <BodyText key={caution}>주의 · {caution}</BodyText>)}</Card> : <BodyText>서버에서 브리프를 준비하고 있습니다. 별도 생성 요청은 필요하지 않습니다.</BodyText>}</Stack></Panel> : null}

    {outputsReady ? <Panel><Stack><Kicker>Actual service · Aftercare</Kicker><Heading style={styles.sectionHeading}>실제로 받은 시술을 기준으로 관리 프로그램을 만듭니다</Heading>{actualService ? <BodyText>{actualService.serviceDate} · {actualService.services.join(", ")} 시술 확정</BodyText> : <><BodyText>헤어 선택만으로는 애프터케어를 만들지 않습니다. 실제 시술 종류와 날짜를 먼저 저장합니다.</BodyText><Cluster>{["커트", "펌", "염색", "클리닉"].map((service) => <Button key={service} variant={serviceTypes.includes(service) ? "primary" : "secondary"} onPress={() => setServiceTypes((current) => current.includes(service) ? current.filter((item) => item !== service) : [...current, service])}>{service}</Button>)}</Cluster><TextInput accessibilityLabel="실제 시술 날짜" value={serviceDate} onChangeText={setServiceDate} placeholder="YYYY-MM-DD" style={styles.textInput} /><Button disabled={serviceTypes.length === 0 || !serviceDate} onPress={() => void createAftercare()}>실제 시술 확정하고 관리 프로그램 자동 생성</Button></>}{aftercare ? <Card><Heading style={styles.briefHeading}>오늘 할 일</Heading>{aftercare.today.map((item) => <BodyText key={item}>· {item}</BodyText>)}<Heading style={styles.briefHeading}>체크포인트</Heading>{aftercare.checkpoints.map((item) => <BodyText key={item.offset}>{item.offset} · {item.action}</BodyText>)}{aftercare.concerns.map((item) => <BodyText key={item}>주의 · {item}</BodyText>)}</Card> : actualService ? <BodyText>저장된 실제 시술을 기준으로 AI 관리 프로그램을 복구 중입니다.</BodyText> : null}</Stack></Panel> : null}

    {outputsReady && fashionDirection ? <Panel><Stack><Kicker>Fashion interview · {completedFashionTopics.length}/7</Kicker><Heading style={styles.sectionHeading}>확정 헤어와 컬러에 이어질 패션 방향</Heading><BodyText>단계형 마법사가 아니라 아직 저장되지 않은 주제만 바로 선택합니다. 단일 선택은 서버 snapshot에 즉시 저장됩니다.</BodyText><BodyText>착용 상황</BodyText><Cluster>{(["daily", "work", "date", "formal"] as const).map((value) => <Button key={value} variant={fashionDirection.situation === value ? "primary" : "secondary"} onPress={() => { const next = { ...fashionDirection, situation: value }; setFashionDirection(next); void saveFashionTopic("context", next); }}>{value}</Button>)}</Cluster><BodyText>분위기</BodyText><Cluster>{["minimal", "casual", "classic", "street", "office", "date"].map((value) => <Button key={value} variant={fashionDirection.genre === value ? "primary" : "secondary"} onPress={() => { const next = { ...fashionDirection, genre: value }; setFashionDirection(next); void saveFashionTopic("impression", next); }}>{value}</Button>)}</Cluster><BodyText>핏</BodyText><Cluster>{(["slim", "regular", "relaxed", "oversized"] as const).map((value) => <Button key={value} variant={fashionDirection.fit === value ? "primary" : "secondary"} onPress={() => { const next = { ...fashionDirection, fit: value }; setFashionDirection(next); void saveFashionTopic("fit", next); }}>{value}</Button>)}</Cluster><BodyText>노출·넥라인 범위</BodyText><Cluster>{(["low", "balanced", "bold"] as const).map((value) => <Button key={value} variant={fashionDirection.exposure === value ? "primary" : "secondary"} onPress={() => { const next = { ...fashionDirection, exposure: value }; setFashionDirection(next); void saveFashionTopic("exposure", next); }}>{value}</Button>)}</Cluster><BodyText>계절</BodyText><Cluster>{(["spring", "summer", "autumn", "winter", "all-season"] as const).map((value) => <Button key={value} variant={fashionDirection.season === value ? "primary" : "secondary"} onPress={() => { const next = { ...fashionDirection, season: value }; setFashionDirection(next); void saveFashionTopic("season", next); }}>{value}</Button>)}</Cluster><TextInput accessibilityLabel="패션 예산" value={fashionDirection.budget} onChangeText={(budget) => setFashionDirection({ ...fashionDirection, budget })} onEndEditing={() => void saveFashionTopic("budget", fashionDirection)} placeholder="예: 기존 옷 활용, 20만원 이내" style={styles.textInput} /><TextInput accessibilityLabel="피하고 싶은 패션 아이템" value={fashionDirection.avoidItems.join(", ")} onChangeText={(text) => setFashionDirection({ ...fashionDirection, avoidItems: text.split(",").map((item) => item.trim()).filter(Boolean) })} onEndEditing={() => void saveFashionTopic("avoid", fashionDirection)} placeholder="예: 모자, 높은 굽" style={styles.textInput} />{!fashionBatch ? <Button disabled={completedFashionTopics.length < 7} onPress={() => void prepareFashion()}>이 방향으로 9개 룩 자동 준비</Button> : <Cluster><Chip>{fashionBatch.state}</Chip><Chip tone="success">{fashionBatch.completedCount}/9 완료</Chip>{["approved", "partial", "failed"].includes(fashionBatch.state) ? <Button variant="secondary" onPress={() => void resumeFashion()}>미완료 룩 다시 접수</Button> : null}</Cluster>}<BodyText>별도의 유료 생성 확인 화면 없이 서버가 이용 권한과 멱등성을 검증합니다.</BodyText></Stack></Panel> : null}

    {fashionPreviews.length ? <Panel><Stack><Kicker>Fashion AI output</Kicker><Heading style={styles.sectionHeading}>9개 룩 중 2~3개를 비교하고 최종 룩을 선택하세요</Heading><View style={styles.grid}>{fashionPreviews.map((preview) => { const active = fashionShortlist.includes(preview.stylingSessionId); const final = fashionFinalist === preview.stylingSessionId; return <Pressable key={preview.stylingSessionId} accessibilityRole="button" accessibilityState={{ disabled: preview.status !== "completed", selected: active }} disabled={preview.status !== "completed"} onPress={() => setFashionShortlist((current) => current.includes(preview.stylingSessionId) ? current.filter((id) => id !== preview.stylingSessionId) : current.length < 3 ? [...current, preview.stylingSessionId] : current)} style={[styles.previewCard, active && styles.previewCardSelected]}>{preview.imageUrl ? <Image accessibilityLabel={preview.headline} source={{ uri: preview.imageUrl }} style={styles.previewImage} /> : <View style={styles.previewPlaceholder}><Text style={styles.previewLabel}>{preview.status}</Text></View>}<Text style={styles.previewLabel}>{preview.headline}</Text>{active ? <Button variant={final ? "primary" : "secondary"} onPress={() => setFashionFinalist(preview.stylingSessionId)}>{final ? "최종 룩" : "최종 지정"}</Button> : null}</Pressable>; })}</View><Button disabled={fashionShortlist.length < 2 || fashionShortlist.length > 3 || !fashionFinalist || !fashionShortlist.includes(fashionFinalist)} onPress={() => void saveFashionSelection()}>패션 최종 선택 저장</Button></Stack></Panel> : null}

    <Button variant="secondary" onPress={() => { void clearActiveV2ConsultationId().then(() => { setConsultation(null); setWorkspace(null); setBoard(null); setEvidence(null); setSelection(null); }); }}>새 상담으로 전환</Button>
  </AppScreen>;
}

const styles = StyleSheet.create({
  briefHeading: { fontSize: 18, lineHeight: 24 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  previewCard: { backgroundColor: "#181713", borderColor: "#34322c", borderRadius: 6, borderWidth: 1, overflow: "hidden", width: "31%" },
  previewCardDisabled: { opacity: 0.58 },
  previewCardSelected: { borderColor: "#d0b06a", borderWidth: 2 },
  previewImage: { aspectRatio: 4 / 5, width: "100%" },
  previewLabel: { color: "#f4f1e8", fontSize: 10, fontWeight: "800", padding: 6 },
  previewPlaceholder: { alignItems: "center", aspectRatio: 4 / 5, backgroundColor: "#24231f", justifyContent: "center", width: "100%" },
  sectionHeading: { fontSize: 22, lineHeight: 28 },
  textInput: { backgroundColor: "#181713", borderColor: "#34322c", borderRadius: 6, borderWidth: 1, color: "#f4f1e8", minHeight: 48, paddingHorizontal: 12, paddingVertical: 10 },
});
