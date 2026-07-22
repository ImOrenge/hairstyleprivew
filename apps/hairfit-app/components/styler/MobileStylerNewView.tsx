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
  TextField,
} from "@hairfit/ui-native";
import { AppScreen } from "../app/AppScreen";
import { Alert, Image, StyleSheet, View } from "react-native";
import { PaidActionQuoteCard } from "../billing/PaidActionQuoteCard";
import { PhotoLibraryPermissionRecovery } from "../app/PhotoLibraryPermissionRecovery";
import {
  formatMobileStylerBodyShape,
  formatMobileStylerCorrectionFocus,
  formatMobileStylerExposure,
  formatMobileStylerFit,
  formatMobileStylerItemSlot,
  formatMobileStylerLength,
  formatMobileStylerPersonalColor,
  MOBILE_STYLER_BODY_SHAPES,
  MOBILE_STYLER_EXPOSURES,
  MOBILE_STYLER_FITS,
  MOBILE_STYLER_GENRES,
} from "./mobileStylerModel";
import { MobileStylerHairSelectionModal } from "./MobileStylerHairSelectionModal";
import type { MobileStylerNewController } from "./useMobileStylerNewController";
import { useMobileResultTranslations } from "../../hooks/useMobileResultTranslations";

function MobileStylerFieldPill({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <Kicker>{label}</Kicker>
      <BodyText style={styles.strongText}>{value || "-"}</BodyText>
    </Card>
  );
}

interface MobileStylerNewViewProps {
  controller: MobileStylerNewController;
  onExit: () => void;
}

export function MobileStylerNewView({ controller, onExit }: MobileStylerNewViewProps) {
  const {
    avoidItems,
    bodyShape,
    bottomSize,
    closeHairModal,
    colorPreference,
    deleteBodyPhoto,
    exposurePreference,
    fitPreference,
    genre,
    hairListError,
    hairGroups,
    hairModalOpen,
    handleGenerate,
    handleGenreSelect,
    handleHairSelect,
    handleRecommend,
    heightCm,
    isGenerating,
    isBackNavigationBlocked,
    isDeletingPhoto,
    isLoadingHairList,
    isLoadingProfile,
    isLoadingVariant,
    isRecommending,
    isSavingProfile,
    isUploadingPhoto,
    message,
    openBilling,
    openBodyPhotoPermissionSettings,
    openHairModal,
    photoPermissionRequiresSettings,
    profile,
    quote,
    quoteError,
    quoteExpired,
    quoteLoading,
    recommendation,
    refreshQuote,
    saveProfile,
    selectedGenre,
    selectedVariant,
    selectedVariantId,
    setAvoidItems,
    setBodyShape,
    setBottomSize,
    setColorPreference,
    setCurrentStep,
    setExposurePreference,
    setFitPreference,
    setHeightCm,
    setTopSize,
    stepOneReady,
    stepThreeReady,
    topSize,
    uploadBodyPhoto,
    visibleStep,
  } = controller;
  const translate = useMobileResultTranslations([
    selectedVariant?.label,
    selectedVariant?.reason,
  ]);
  const selectedVariantLabel = selectedVariant
    ? translate(selectedVariant.label, `추천 스타일 ${selectedVariant.rank}`)
    : "선택한 헤어스타일이 없습니다";
  const selectedVariantReason = selectedVariant
    ? translate(selectedVariant.reason, "얼굴형과 전체 균형을 고려한 추천 스타일입니다.")
    : "최근 3×3 헤어 추천에서 완성된 결과 하나를 선택해 주세요.";

  const confirmBodyPhotoDelete = () => {
    Alert.alert(
      "전신 사진을 삭제할까요?",
      "비공개 저장소에서 즉시 삭제되며, 새 사진을 등록하기 전에는 룩북을 생성할 수 없습니다.",
      [
        { text: "취소", style: "cancel" },
        { text: "삭제", style: "destructive", onPress: () => void deleteBodyPhoto() },
      ],
    );
  };

  return (
    <AppScreen>
      <Stack>
        <Kicker>패션 스타일러</Kicker>
        <Heading>선택한 헤어에 어울리는 전신 코디 만들기</Heading>
        <View accessibilityLiveRegion="polite">
          <BodyText>{message}</BodyText>
        </View>
        <Button disabled={isBackNavigationBlocked} variant="secondary" onPress={onExit}>
          마이페이지로 돌아가기
        </Button>
      </Stack>

      <Panel>
        <Stack>
          <Kicker>선택한 헤어스타일</Kicker>
          <Heading>{isLoadingVariant ? "헤어스타일을 불러오는 중입니다" : selectedVariantLabel}</Heading>
          <BodyText>{selectedVariantReason}</BodyText>
          {selectedVariant?.outputUrl ? (
            <Image
              accessibilityLabel={`${selectedVariantLabel} 헤어스타일 결과`}
              accessibilityRole="image"
              source={{ uri: selectedVariant.outputUrl }}
              style={styles.hairPreview}
            />
          ) : null}
          <Cluster>
            <MobileStylerFieldPill label="기장" value={formatMobileStylerLength(selectedVariant?.lengthBucket)} />
            <MobileStylerFieldPill label="보정 포인트" value={formatMobileStylerCorrectionFocus(selectedVariant?.correctionFocus)} />
            <MobileStylerFieldPill label="퍼스널컬러" value={formatMobileStylerPersonalColor(profile)} />
          </Cluster>
          <Button onPress={openHairModal} variant="secondary">헤어스타일 선택 또는 변경</Button>
        </Stack>
      </Panel>

      <Cluster>
        <Chip tone={visibleStep === 1 ? "accent" : stepOneReady ? "success" : "neutral"}>1 준비 정보</Chip>
        <Chip tone={visibleStep === 2 ? "accent" : stepThreeReady ? "success" : "neutral"}>2 코디 방향</Chip>
        <Chip tone={visibleStep === 3 ? "accent" : "neutral"}>3 견적·생성</Chip>
      </Cluster>

      {visibleStep === 1 ? (
        <Panel>
          <Stack>
            <Kicker>1단계 · 준비 정보</Kicker>
            <Heading>{isLoadingProfile ? "프로필을 확인하는 중입니다" : stepOneReady ? "코디 추천 준비가 끝났습니다" : "필수 정보를 완성해 주세요"}</Heading>
            <BodyText>키, 체형, 상·하의 사이즈, 핏·노출 선호, 전신 사진과 사용할 헤어스타일이 필요합니다.</BodyText>
            <MobileStylerFieldPill label="퍼스널컬러 상태" value={formatMobileStylerPersonalColor(profile)} />

            <TextField keyboardType="numeric" label="키(cm)" onChangeText={setHeightCm} placeholder="예: 168" value={heightCm} />
            <TextField label="상의 사이즈" onChangeText={setTopSize} placeholder="예: M, 95" value={topSize} />
            <TextField label="하의 사이즈" onChangeText={setBottomSize} placeholder="예: M, 30" value={bottomSize} />
            <TextField label="선호 색상" onChangeText={setColorPreference} placeholder="예: 블랙, 베이지, 데님" value={colorPreference} />
            <TextField label="피하고 싶은 아이템" onChangeText={setAvoidItems} placeholder="예: 스키니진, 형광색" value={avoidItems} />

            <Kicker>체형</Kicker>
            <Cluster>
              {MOBILE_STYLER_BODY_SHAPES.map((value) => (
                <Button accessibilityState={{ selected: bodyShape === value }} key={value} onPress={() => setBodyShape(value)} variant={bodyShape === value ? "primary" : "secondary"}>{formatMobileStylerBodyShape(value)}</Button>
              ))}
            </Cluster>
            <Kicker>선호 핏</Kicker>
            <Cluster>
              {MOBILE_STYLER_FITS.map((value) => (
                <Button accessibilityState={{ selected: fitPreference === value }} key={value} onPress={() => setFitPreference(value)} variant={fitPreference === value ? "primary" : "secondary"}>{formatMobileStylerFit(value)}</Button>
              ))}
            </Cluster>
            <Kicker>노출 선호</Kicker>
            <Cluster>
              {MOBILE_STYLER_EXPOSURES.map((value) => (
                <Button accessibilityState={{ selected: exposurePreference === value }} key={value} onPress={() => setExposurePreference(value)} variant={exposurePreference === value ? "primary" : "secondary"}>{formatMobileStylerExposure(value)}</Button>
              ))}
            </Cluster>

            {profile?.bodyPhotoUrl ? (
              <Image
                accessibilityLabel="패션 룩북 생성에 사용할 저장된 전신 사진"
                accessibilityRole="image"
                source={{ uri: profile.bodyPhotoUrl }}
                style={styles.bodyPreview}
              />
            ) : (
              <Card><BodyText>룩북 생성을 위해 얼굴부터 발끝까지 보이는 전신 참고 사진을 등록해 주세요.</BodyText></Card>
            )}
            <Card>
              <Stack gap={8}>
                <Kicker>전신 사진 개인정보 안내</Kicker>
                <BodyText>사진은 HairFit 비공개 저장소에 보관되며, 패션 추천과 룩북 생성 때만 짧은 시간 동안 안전하게 불러옵니다.</BodyText>
                <BodyText>새 사진으로 교체하면 이전 파일은 삭제됩니다. 직접 삭제하기 전까지 바디 프로필에 보관되며, 아래 삭제 버튼으로 즉시 제거할 수 있습니다.</BodyText>
              </Stack>
            </Card>
            <Button disabled={isUploadingPhoto || isDeletingPhoto} onPress={uploadBodyPhoto} variant="secondary">
              {isUploadingPhoto ? "전신 사진 업로드 중..." : profile?.bodyPhotoPath ? "전신 사진 변경" : "전신 사진 업로드"}
            </Button>
            {profile?.bodyPhotoPath ? (
              <Button disabled={isUploadingPhoto || isDeletingPhoto} onPress={confirmBodyPhotoDelete} variant="secondary">
                {isDeletingPhoto ? "전신 사진 삭제 중..." : "전신 사진 삭제"}
              </Button>
            ) : null}
            <PhotoLibraryPermissionRecovery
              onOpenSettings={() => void openBodyPhotoPermissionSettings()}
              visible={photoPermissionRequiresSettings}
            />
            <Button disabled={isSavingProfile} onPress={saveProfile}>{isSavingProfile ? "프로필 저장 중..." : "프로필 저장"}</Button>
            <Button disabled={!stepOneReady || isLoadingProfile || isLoadingVariant} onPress={() => setCurrentStep(2)}>
              다음: 코디 방향 선택
            </Button>
          </Stack>
        </Panel>
      ) : null}

      {visibleStep === 2 ? (
        <Panel>
          <Stack>
            <Kicker>2단계 · 코디 방향</Kicker>
            <Heading>추천받을 패션 장르를 선택하세요</Heading>
            <BodyText>선택한 장르와 저장된 프로필을 바탕으로 이번 코디 방향을 먼저 제안합니다.</BodyText>
            {MOBILE_STYLER_GENRES.map((option) => (
              <Card key={option.value} style={genre === option.value ? styles.selectedCard : undefined}>
                <Stack>
                  <Heading>{option.label}</Heading>
                  <BodyText>{option.description}</BodyText>
                  <Button accessibilityState={{ selected: genre === option.value }} onPress={() => handleGenreSelect(option.value)} variant={genre === option.value ? "primary" : "secondary"}>
                    {genre === option.value ? "선택됨" : "선택"}
                  </Button>
                </Stack>
              </Card>
            ))}
            <Card>
              <Kicker>선택한 방향</Kicker>
              <BodyText>{selectedGenre.label} · {selectedGenre.description}</BodyText>
            </Card>
            <Button onPress={() => setCurrentStep(1)} variant="secondary">이전</Button>
            <Button disabled={isRecommending || isGenerating} onPress={handleRecommend}>
              {isRecommending ? "패션 추천 만드는 중..." : "패션 추천 만들기"}
            </Button>
          </Stack>
        </Panel>
      ) : null}

      {visibleStep === 3 ? (
        <Panel>
          <Stack>
            <Kicker>3단계 · 견적 확인과 생성</Kicker>
            <Heading>{recommendation?.headline || "패션 추천 미리보기"}</Heading>
            <BodyText>{recommendation?.summary || "추천을 만든 뒤 비용과 실패 시 복구 정책을 확인하고 룩북 생성을 시작할 수 있습니다."}</BodyText>
            {recommendation ? (
              <Stack>
                <Cluster>
                  <MobileStylerFieldPill label="장르" value={selectedGenre.label} />
                  <MobileStylerFieldPill label="실루엣" value={recommendation.silhouette} />
                  <MobileStylerFieldPill label="색상 팔레트" value={recommendation.palette.join(", ")} />
                </Cluster>
                {recommendation.items.map((item) => (
                  <Card key={item.slot}>
                    <Kicker>{formatMobileStylerItemSlot(item.slot)}</Kicker>
                    <Heading>{item.name}</Heading>
                    <BodyText>{item.description}</BodyText>
                    <BodyText>{item.color} · {item.fit} · {item.material}</BodyText>
                  </Card>
                ))}
                <Card>
                  <Kicker>스타일링 노트</Kicker>
                  {recommendation.stylingNotes.map((note) => <BodyText key={note}>{note}</BodyText>)}
                </Card>
              </Stack>
            ) : null}
            <PaidActionQuoteCard
              error={quoteError}
              loading={quoteLoading}
              onOpenBilling={openBilling}
              onRefresh={() => void refreshQuote()}
              payerLabel="내 계정"
              quote={quote}
            />
            <Card>
              <BodyText>결제나 충전 뒤에도 자동으로 생성하지 않습니다. 이 화면 또는 룩북 세션 화면에서 최신 견적을 다시 확인한 뒤 직접 시작해 주세요.</BodyText>
            </Card>
            <Button onPress={() => setCurrentStep(2)} variant="secondary">이전</Button>
            <Button
              disabled={!stepThreeReady || isGenerating || quoteLoading || !quote || quoteExpired || !quote.isAllowed}
              loading={isGenerating}
              loadingLabel="룩북 생성 요청 중"
              onPress={handleGenerate}
            >
              룩북 이미지 생성 시작
            </Button>
          </Stack>
        </Panel>
      ) : null}

      <MobileStylerHairSelectionModal
        error={hairListError}
        groups={hairGroups}
        isLoading={isLoadingHairList}
        onClose={closeHairModal}
        onSelect={handleHairSelect}
        open={hairModalOpen}
        selectedVariantId={selectedVariantId}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  bodyPreview: { aspectRatio: 3 / 4, borderRadius: 8, width: "100%" },
  hairPreview: { aspectRatio: 4 / 5, borderRadius: 8, width: 120 },
  selectedCard: { borderColor: "#181411", borderWidth: 2 },
  strongText: { color: "#181411", fontWeight: "800" },
});
