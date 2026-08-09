import { useAuth } from "@clerk/clerk-expo";
import type {
  AnalysisEvidenceV2,
  ConsultationSessionV2,
  PreviewBoardV2,
  SalonBriefV2,
  StyleSelectionSnapshotV2,
} from "@hairfit/shared";
import { effectiveEvidencePointV2 } from "@hairfit/shared";
import { BodyText, Button, Card, Chip, Cluster, Heading, Kicker, Panel, Stack } from "@hairfit/ui-native";
import * as Crypto from "expo-crypto";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
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
  const [board, setBoard] = useState<PreviewBoardV2 | null>(null);
  const [evidence, setEvidence] = useState<EvidenceState | null>(null);
  const [selection, setSelection] = useState<StyleSelectionSnapshotV2 | null>(null);
  const [brief, setBrief] = useState<SalonBriefV2 | null>(null);
  const [shortlist, setShortlist] = useState<string[]>([]);
  const [finalistId, setFinalistId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedLandmarkId, setSelectedLandmarkId] = useState<string | null>(null);

  const load = useCallback(async (consultationId: string) => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await api.getV2Consultation(consultationId);
      const next = response.consultation;
      setConsultation(next);
      await saveActiveV2ConsultationId(next.id);

      const [nextEvidence, nextBoard, nextShortlist, nextSelection] = await Promise.all([
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

  const create = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await api.createV2Consultation({
        sessionKind: "full_style",
        idempotencyKey: `mobile-consulting:${Crypto.randomUUID()}`,
        preferences: { client: "expo", journey: "ai_consultant" },
      });
      await saveActiveV2ConsultationId(response.consultation.id);
      setConsultation(response.consultation);
      setBoard(null);
      setEvidence(null);
      setSelection(null);
      setBrief(null);
      setShortlist([]);
      setFinalistId(null);
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

  const createBrief = async () => {
    if (!consultation) return;
    setLoading(true);
    try {
      const response = await api.createV2SalonBrief(
        consultation.id,
        `mobile-brief:${consultation.id}:${consultation.selectedSnapshotId}`,
      );
      setBrief(response.brief);
      await load(consultation.id);
    } catch (error) {
      setMessage(mapMobileUserError(error, "살롱 브리프를 만들지 못했습니다."));
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
  const canCreateBrief = ["selection_confirmed", "fashion_ready", "aftercare_ready"].includes(consultation.state);

  return <AppScreen>
    <Panel><Stack><Cluster><Chip tone="success">V2</Chip><Chip>{stateLabel(consultation.state)}</Chip></Cluster><Kicker>HairFit AI Consultant</Kicker><Heading>상담 이어하기</Heading><BodyText>세션 {consultation.id.slice(0, 8)} · 버전 {consultation.version}</BodyText><BodyText>앱을 종료해도 이 서버 세션에서 분석, 생성, 선택 상태를 다시 이어갑니다.</BodyText><Button variant="secondary" onPress={() => void load(consultation.id)}>서버 상태 새로고침</Button></Stack></Panel>

    {message ? <View accessibilityLiveRegion="assertive" accessibilityRole="alert"><Card><BodyText>{message}</BodyText></Card></View> : null}

    {evidence?.overlayEnabled ? <Panel><Stack><Kicker>서버 AI 분석 근거</Kicker><Heading style={styles.sectionHeading}>얼굴 랜드마크와 측정 근거</Heading><NativeFaceEvidenceOverlay evidence={evidence.evidence} sourceImageUrl={evidence.sourceImageUrl} /><BodyText>{evidence.evidence.faceShape.summary}</BodyText><BodyText>선택 기준점: {selectedLandmarkId ?? "없음"} · 보정 리비전 {evidence.evidence.correctionRevision}</BodyText><Cluster><Button variant="secondary" onPress={cycleLandmark}>다음 기준점</Button><Button variant="secondary" onPress={() => void correctLandmark(0, -0.005)}>위</Button><Button variant="secondary" onPress={() => void correctLandmark(-0.005, 0)}>왼쪽</Button><Button variant="secondary" onPress={() => void correctLandmark(0.005, 0)}>오른쪽</Button><Button variant="secondary" onPress={() => void correctLandmark(0, 0.005)}>아래</Button><Button variant="secondary" onPress={() => void correctLandmark(0, 0, true)}>AI 원본</Button></Cluster><BodyText>사용자 보정은 표시 좌표에만 적용되며 AI 원본 좌표는 감사 이력으로 보존됩니다.</BodyText></Stack></Panel> : null}

    {!consultation.analysisEvidenceId ? <Panel><Stack><Kicker>Photo quality</Kicker><Heading style={styles.sectionHeading}>사진 업로드와 AI 분석</Heading><BodyText>기기 기본 검사를 통과한 사진만 서버 사전검사와 얼굴 랜드마크 분석으로 보냅니다.</BodyText><Button onPress={() => router.push(photoRoute)}>사진 선택·분석</Button></Stack></Panel> : null}

    {canOpenGeneration ? <Panel><Stack><Kicker>3×3 preview</Kicker><Heading style={styles.sectionHeading}>분석 근거로 프리뷰 생성</Heading><BodyText>AI 분석이 완료되었습니다. 최신 이용 조건을 확인하고 서버 생성 작업을 접수하세요.</BodyText><Button onPress={() => router.push(generationRoute)}>3×3 생성 접수</Button></Stack></Panel> : null}

    {board ? <Panel><Stack><Cluster><Chip>{board.state}</Chip><Chip tone="success">품질 통과 {board.acceptedCount} / 9</Chip></Cluster><Kicker>3×3 board</Kicker><Heading style={styles.sectionHeading}>품질 통과 프리뷰 비교</Heading><View style={styles.grid}>{board.variants.map((variant) => { const imageUrl = acceptedImage(board, variant.id); const active = shortlist.includes(variant.id); return <Pressable accessibilityRole="button" accessibilityState={{ disabled: !imageUrl, selected: active }} disabled={!imageUrl} key={variant.id} onPress={() => toggleShortlist(variant.id)} style={[styles.previewCard, active && styles.previewCardSelected, !imageUrl && styles.previewCardDisabled]}>{imageUrl ? <Image accessibilityLabel={`프리뷰 ${variant.slot}`} source={{ uri: imageUrl }} style={styles.previewImage} /> : <View style={styles.previewPlaceholder}><Text style={styles.previewLabel}>{variant.status === "generating" ? "생성 중" : "대기"}</Text></View>}<Text style={styles.previewLabel}>{variant.slot} · {variant.bucket}</Text></Pressable>; })}</View><BodyText>완료된 결과 중 2~3개를 선택합니다. 현재 {shortlist.length}개.</BodyText><Button disabled={shortlist.length < 2 || shortlist.length > 3} onPress={() => void saveShortlist()}>후보 비교 저장</Button></Stack></Panel> : consultation.sourceGenerationId ? <Card><BodyText>3×3 프리뷰 보드를 준비하고 있습니다. 잠시 후 서버 상태를 새로고침해 주세요.</BodyText></Card> : null}

    {consultation.state === "shortlisted" && board ? <Panel><Stack><Kicker>Final decision</Kicker><Heading style={styles.sectionHeading}>최종 헤어 한 개 선택</Heading>{acceptedVariants.filter((variant) => shortlist.includes(variant.id)).map((variant) => <Button key={variant.id} variant={finalistId === variant.id ? "primary" : "secondary"} onPress={() => setFinalistId(variant.id)}>프리뷰 {variant.slot}{finalistId === variant.id ? " · 최종 후보" : ""}</Button>)}<Button disabled={!finalistId} onPress={() => void draftSelection()}>최종 후보 검토</Button></Stack></Panel> : null}

    {consultation.state === "style_selected" && selection ? <Panel><Stack><Kicker>Confirmation</Kicker><Heading style={styles.sectionHeading}>{selection.style.name}</Heading><BodyText>{selection.style.recommendationReason}</BodyText><BodyText>확정 후에는 같은 상담에서 선택을 바꿀 수 없습니다.</BodyText><Button onPress={() => void confirmSelection()}>이 헤어로 확정</Button></Stack></Panel> : null}

    {canCreateBrief ? <Panel><Stack><Kicker>Salon brief</Kicker><Heading style={styles.sectionHeading}>확정 스냅샷으로 시술 상담 준비</Heading><Button onPress={() => void createBrief()}>살롱 브리프 만들기</Button>{brief ? <Card><Heading style={styles.briefHeading}>{brief.summary}</Heading>{brief.cautions.map((caution) => <BodyText key={caution}>{caution}</BodyText>)}</Card> : null}<Button variant="secondary" onPress={() => router.push("/mypage")}>애프터케어·패션 프로필 관리</Button></Stack></Panel> : null}

    <Button variant="secondary" onPress={() => { void clearActiveV2ConsultationId().then(() => { setConsultation(null); setBoard(null); setEvidence(null); setSelection(null); }); }}>새 상담으로 전환</Button>
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
});
