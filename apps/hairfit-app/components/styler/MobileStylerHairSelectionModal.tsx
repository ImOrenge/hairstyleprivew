import type {
  GeneratedVariant,
  HairstyleGenerationGroup,
} from "@hairfit/shared";
import {
  BodyText,
  Button,
  Card,
  Chip,
  Cluster,
  Heading,
  Kicker,
  Stack,
} from "@hairfit/ui-native";
import { FlatList, Image, Modal, Pressable, StyleSheet, View } from "react-native";
import {
  resolveMotionAwareModalAnimation,
  useReducedMotionPreference,
} from "../../hooks/useReducedMotionPreference";
import { useMobileResultTranslations } from "../../hooks/useMobileResultTranslations";
import {
  formatMobileStylerFaceShape,
  formatMobileStylerLength,
  formatMobileStylerStatus,
} from "./mobileStylerModel";

interface MobileStylerHairSelectionModalProps {
  groups: HairstyleGenerationGroup[];
  open: boolean;
  selectedVariantId: string;
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
  onSelect: (generationId: string, variant: GeneratedVariant) => void;
}

export function MobileStylerHairSelectionModal({
  groups,
  open,
  selectedVariantId,
  isLoading,
  error,
  onClose,
  onSelect,
}: MobileStylerHairSelectionModalProps) {
  const reduceMotion = useReducedMotionPreference();
  const translate = useMobileResultTranslations(
    groups.flatMap((group) => group.variants.flatMap((variant) => [variant.label, variant.reason])),
  );

  return (
    <Modal
      animationType={resolveMotionAwareModalAnimation(reduceMotion, "slide")}
      onRequestClose={onClose}
      testID="styler-hair-selection-modal"
      transparent
      visible={open}
    >
      <View style={styles.modalBackdrop}>
        <View
          accessibilityLabel="최근 헤어스타일 선택"
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
          style={styles.modalPanel}
        >
          <Stack gap={10}>
            <Kicker>헤어스타일 선택</Kicker>
            <Heading>최근 완성 결과에서 하나를 선택하세요</Heading>
            {isLoading ? (
              <View accessibilityLiveRegion="polite" accessibilityState={{ busy: true }}>
                <BodyText>최근 헤어 추천 결과를 불러오는 중입니다.</BodyText>
              </View>
            ) : null}
            {error ? (
              <View accessibilityLiveRegion="assertive">
                <BodyText style={styles.errorText}>{error}</BodyText>
              </View>
            ) : null}
          </Stack>
          <FlatList
            contentContainerStyle={styles.hairListContent}
            data={groups}
            extraData={selectedVariantId}
            initialNumToRender={3}
            keyboardShouldPersistTaps="handled"
            keyExtractor={(group) => group.id}
            ListEmptyComponent={!isLoading ? (
              <Card>
                <Stack>
                  <Heading>선택할 헤어스타일 결과가 없습니다</Heading>
                  <BodyText>먼저 3×3 헤어 추천을 완료한 뒤 패션 스타일링을 이어가 주세요.</BodyText>
                </Stack>
              </Card>
            ) : null}
            maxToRenderPerBatch={3}
            nestedScrollEnabled
            renderItem={({ item: group }) => (
              <Card>
                <Stack>
                  <Kicker>{new Date(group.createdAt).toLocaleString("ko-KR")} 생성 결과</Kicker>
                  <BodyText>얼굴형: {formatMobileStylerFaceShape(group.analysis.faceShape)} · 상태: {formatMobileStylerStatus(group.status)}</BodyText>
                  {group.variants.map((variant) => {
                    const selectable = Boolean(variant.outputUrl);
                    const selected = selectedVariantId === variant.id;
                    const displayLabel = translate(variant.label, `추천 스타일 ${variant.rank}`);
                    const displayReason = translate(
                      variant.reason,
                      "얼굴형과 전체 균형을 고려한 추천 스타일입니다.",
                    );
                    return (
                      <Pressable
                        accessibilityLabel={`${displayLabel}${selected ? ", 선택됨" : ""}`}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: !selectable, selected }}
                        disabled={!selectable}
                        key={variant.id}
                        onPress={() => onSelect(group.id, variant)}
                        style={[styles.hairOption, selected ? styles.hairOptionSelected : null, !selectable ? styles.disabled : null]}
                      >
                        {variant.outputUrl ? (
                          <Image
                            accessibilityLabel={`${displayLabel} 헤어스타일 결과`}
                            accessibilityRole="image"
                            source={{ uri: variant.outputUrl }}
                            style={styles.hairThumb}
                          />
                        ) : (
                          <View style={styles.hairThumbPlaceholder}>
                            <BodyText>{formatMobileStylerStatus(variant.status)}</BodyText>
                          </View>
                        )}
                        <View style={styles.hairCopy}>
                          <BodyText style={styles.strongText}>{displayLabel}</BodyText>
                          <BodyText>{displayReason}</BodyText>
                          <Cluster>
                            <Chip>{formatMobileStylerLength(variant.lengthBucket)}</Chip>
                            {selected ? <Chip tone="success">선택됨</Chip> : null}
                          </Cluster>
                        </View>
                      </Pressable>
                    );
                  })}
                </Stack>
              </Card>
            )}
            style={styles.hairList}
            updateCellsBatchingPeriod={50}
            windowSize={3}
          />
          <Button onPress={onClose} variant="secondary">닫기</Button>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  disabled: { opacity: 0.55 },
  errorText: { color: "#b42318" },
  hairCopy: { flex: 1, gap: 8 },
  hairList: { flexGrow: 0, flexShrink: 1, marginVertical: 12 },
  hairListContent: { gap: 12, paddingBottom: 4 },
  hairOption: {
    backgroundColor: "#fffdf8",
    borderColor: "#ded6ca",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 10,
  },
  hairOptionSelected: { borderColor: "#181411", borderWidth: 2 },
  hairThumb: { aspectRatio: 4 / 5, borderRadius: 8, width: 86 },
  hairThumbPlaceholder: {
    alignItems: "center",
    aspectRatio: 4 / 5,
    backgroundColor: "#eee8de",
    borderRadius: 8,
    justifyContent: "center",
    width: 86,
  },
  modalBackdrop: {
    backgroundColor: "rgba(0,0,0,0.45)",
    flex: 1,
    justifyContent: "flex-end",
  },
  modalPanel: {
    backgroundColor: "#f7f4ef",
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    maxHeight: "88%",
    padding: 16,
  },
  strongText: { color: "#181411", fontWeight: "800" },
});
