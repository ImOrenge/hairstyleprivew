import {
  GENERATION_JOB_COPY,
  GENERATION_JOB_STEPS,
  getGenerationJobRefreshLabel,
  getGenerationVariantProgressSummary,
  type GenerationJobProgressPresentation,
} from "@hairfit/shared";
import { BodyText, Button, Card, Heading, Kicker, Stack } from "@hairfit/ui-native";
import { StyleSheet, Text, View } from "react-native";

interface GenerationJobProgressCardProps {
  presentation: GenerationJobProgressPresentation;
  lastCheckedAt?: Date | null;
  refreshing?: boolean;
  onRefresh?: () => void;
}

function formatCheckedAt(value?: Date | null) {
  if (!value) return GENERATION_JOB_COPY.checkingLabelKo;
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
}

export function GenerationJobProgressCard({
  presentation,
  lastCheckedAt,
  refreshing = false,
  onRefresh,
}: GenerationJobProgressCardProps) {
  const variantSummary = getGenerationVariantProgressSummary(presentation);

  return (
    <View accessibilityLiveRegion="polite">
      <Card>
        <Stack gap={12}>
          <Kicker>{GENERATION_JOB_COPY.headingKo}</Kicker>
          <Heading>{presentation.labelKo}</Heading>
          <BodyText>{presentation.descriptionKo}</BodyText>

          <View
            accessible
            accessibilityLabel={GENERATION_JOB_COPY.progressAriaLabelKo}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: presentation.progressPercent }}
            style={styles.progressTrack}
          >
            <View style={[styles.progressFill, { width: `${presentation.progressPercent}%` }]} />
          </View>
          <BodyText>
            {GENERATION_JOB_COPY.progressLabelKo} {presentation.progressPercent}% · {GENERATION_JOB_COPY.recentCheckPrefixKo} {formatCheckedAt(lastCheckedAt)}
          </BodyText>
          <BodyText>{GENERATION_JOB_COPY.serverStageBasisKo}</BodyText>

          <View accessibilityRole="list" style={styles.steps}>
            {GENERATION_JOB_STEPS.map((step, index) => {
              const reached = index <= presentation.activeStepIndex;
              return (
                <View
                  key={step}
                  accessible
                  accessibilityLabel={`${index + 1}단계 ${step}${reached ? ", 도달" : ", 대기"}`}
                  style={[styles.step, reached ? styles.stepReached : null]}
                >
                  <Text style={[styles.stepText, reached ? styles.stepTextReached : null]}>
                    {index + 1}. {step}
                  </Text>
                </View>
              );
            })}
          </View>

          {variantSummary ? <BodyText>{variantSummary}</BodyText> : null}

          {onRefresh ? (
            <Button disabled={refreshing} variant="secondary" onPress={onRefresh}>
              {getGenerationJobRefreshLabel(refreshing)}
            </Button>
          ) : null}
        </Stack>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  progressTrack: {
    backgroundColor: "#e5ded3",
    borderRadius: 999,
    height: 8,
    overflow: "hidden",
    width: "100%",
  },
  progressFill: {
    backgroundColor: "#181411",
    borderRadius: 999,
    height: "100%",
  },
  steps: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  step: {
    borderColor: "#d8d0c4",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  stepReached: {
    backgroundColor: "#eee8de",
    borderColor: "#181411",
  },
  stepText: {
    color: "#71685f",
    fontSize: 12,
    fontWeight: "600",
  },
  stepTextReached: {
    color: "#181411",
  },
});
