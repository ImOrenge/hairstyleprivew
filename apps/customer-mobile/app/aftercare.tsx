import type { MobileAftercareRecord } from "@hairfit/shared";
import { BodyText, Button, Card, Chip, Cluster, Heading, Kicker, Panel, Screen, Stack } from "@hairfit/ui-native";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useHairfitApi } from "../lib/api";

const serviceLabels: Record<string, string> = {
  cut: "Cut",
  perm: "Perm",
  color: "Color",
  bleach: "Bleach",
  treatment: "Treatment",
  other: "Other service",
};

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

export default function AftercareScreen() {
  const router = useRouter();
  const api = useHairfitApi();
  const [records, setRecords] = useState<MobileAftercareRecord[]>([]);
  const [message, setMessage] = useState("Loading aftercare records...");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const result = await api.getAftercareRecords();
        if (!cancelled) {
          setRecords(result.records);
          setMessage(result.records.length ? "Review saved care guides for confirmed hairstyles." : "No confirmed salon record yet.");
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Failed to load aftercare records.");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [api]);

  return (
    <Screen>
      <Panel>
        <Stack>
          <Kicker>Aftercare</Kicker>
          <Heading>Care guides for confirmed hairstyles</Heading>
          <BodyText>{message}</BodyText>
          <Button onPress={() => router.push("/upload")}>Create new style</Button>
        </Stack>
      </Panel>

      {records.length === 0 ? (
        <Card>
          <Stack>
            <Heading>No confirmed service yet</Heading>
            <BodyText>Confirm a selected hairstyle on the result page to generate an aftercare guide.</BodyText>
            <Button onPress={() => router.push("/generate")}>Go to results</Button>
          </Stack>
        </Card>
      ) : (
        <Stack>
          {records.map((record) => (
            <Card key={record.id}>
              <Stack>
                <Cluster>
                  <Chip tone="success">{serviceLabels[record.serviceType] || record.serviceType}</Chip>
                  <Chip>{formatDate(record.serviceDate)}</Chip>
                </Cluster>
                <Heading>{record.styleName}</Heading>
                <BodyText>Recommended revisit: {nextVisitDate(record.serviceDate, record.nextVisitTargetDays)}</BodyText>
                <Button onPress={() => router.push(`/aftercare/${record.id}`)}>Open guide</Button>
              </Stack>
            </Card>
          ))}
        </Stack>
      )}
    </Screen>
  );
}
