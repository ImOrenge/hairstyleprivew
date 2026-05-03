import type { AftercareSectionKey, MobileAftercareGuideResponse } from "@hairfit/shared";
import { BodyText, Button, Card, Chip, Cluster, Heading, Kicker, Panel, Screen, Stack } from "@hairfit/ui-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useHairfitApi } from "../../lib/api";

const serviceLabels: Record<string, string> = {
  cut: "Cut",
  perm: "Perm",
  color: "Color",
  bleach: "Bleach",
  treatment: "Treatment",
  other: "Other service",
};

const sectionOrder: Array<{ key: AftercareSectionKey; label: string }> = [
  { key: "dry", label: "Dry" },
  { key: "treatment", label: "Treatment" },
  { key: "iron", label: "Iron" },
  { key: "styling", label: "Styling" },
];

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "-";
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function nextVisitDate(serviceDate: string, days: number) {
  const date = new Date(`${serviceDate}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return "-";
  date.setDate(date.getDate() + days);
  return formatDate(date.toISOString());
}

export default function AftercareDetailScreen() {
  const router = useRouter();
  const api = useHairfitApi();
  const { hairRecordId } = useLocalSearchParams<{ hairRecordId: string }>();
  const id = typeof hairRecordId === "string" ? hairRecordId : "";
  const [detail, setDetail] = useState<MobileAftercareGuideResponse | null>(null);
  const [message, setMessage] = useState("Loading aftercare guide...");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!id) return;
      try {
        const result = await api.getAftercareGuide(id);
        if (!cancelled) {
          setDetail(result);
          setMessage("Follow the care timing, section steps, and next action checklist.");
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Failed to load aftercare guide.");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [api, id]);

  const record = detail?.record;
  const guide = detail?.guide;

  return (
    <Screen>
      <Button variant="ghost" onPress={() => router.push("/aftercare")}>Back to aftercare list</Button>

      <Panel>
        <Stack>
          <Kicker>Aftercare Guide</Kicker>
          <Heading>{guide?.overview.headline || record?.styleName || "Aftercare guide"}</Heading>
          <BodyText>{guide?.overview.summary || message}</BodyText>
          {record ? (
            <Cluster>
              <Chip tone="success">{serviceLabels[record.serviceType] || record.serviceType}</Chip>
              <Chip>Service: {formatDate(record.serviceDate)}</Chip>
              <Chip>Revisit: {nextVisitDate(record.serviceDate, record.nextVisitTargetDays)}</Chip>
            </Cluster>
          ) : null}
          {record?.generationId ? (
            <Button onPress={() => router.push(`/result/${record.generationId}`)}>Open hair result</Button>
          ) : null}
        </Stack>
      </Panel>

      {guide ? (
        <Stack>
          {sectionOrder.map(({ key, label }) => {
            const section = guide.sections[key];
            return (
              <Card key={key}>
                <Stack>
                  <Kicker>{label}</Kicker>
                  <Heading>{section.title}</Heading>
                  <BodyText>{section.goal}</BodyText>
                  <Chip tone="success">Timing: {section.timing}</Chip>
                  <Kicker>Steps</Kicker>
                  {section.steps.map((step, index) => (
                    <BodyText key={`${key}-step-${index}`}>{index + 1}. {step}</BodyText>
                  ))}
                  <Kicker>Products</Kicker>
                  <Cluster>
                    {section.products.map((product) => (
                      <Chip key={product} tone="success">{product}</Chip>
                    ))}
                  </Cluster>
                  <Kicker>Avoid</Kicker>
                  {section.avoid.map((item) => (
                    <BodyText key={item}>- {item}</BodyText>
                  ))}
                </Stack>
              </Card>
            );
          })}

          <Panel>
            <Stack>
              <Heading>Maintenance schedule</Heading>
              {guide.maintenanceSchedule.map((item) => (
                <Card key={`${item.label}-${item.dayOffset}`}>
                  <Kicker>{item.label}</Kicker>
                  <BodyText>{item.description}</BodyText>
                </Card>
              ))}
            </Stack>
          </Panel>

          <Card>
            <Stack>
              <Kicker>Warnings</Kicker>
              {guide.warnings.map((warning) => (
                <BodyText key={warning}>- {warning}</BodyText>
              ))}
            </Stack>
          </Card>

          <Card>
            <Stack>
              <Kicker>Next actions</Kicker>
              {guide.recommendedNextActions.map((action) => (
                <BodyText key={action}>- {action}</BodyText>
              ))}
            </Stack>
          </Card>
        </Stack>
      ) : (
        <BodyText>{message}</BodyText>
      )}
    </Screen>
  );
}
