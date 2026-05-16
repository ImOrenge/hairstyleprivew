import type { AftercareSectionKey, MobileAftercareGuideResponse } from "@hairfit/shared";
import { BodyText, Button, Card, Chip, Cluster, Heading, Kicker, Panel, Screen, Stack } from "@hairfit/ui-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useHairfitApi } from "../../lib/api";

const serviceLabels: Record<string, string> = {
  cut: "커트",
  perm: "펌",
  color: "염색",
  bleach: "탈색",
  treatment: "트리트먼트",
  other: "기타 시술",
};

const sectionOrder: Array<{ key: AftercareSectionKey; label: string }> = [
  { key: "dry", label: "드라이" },
  { key: "treatment", label: "트리트먼트" },
  { key: "iron", label: "아이론" },
  { key: "styling", label: "스타일링" },
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
  const [message, setMessage] = useState("에프터케어 가이드를 불러오는 중입니다.");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!id) return;
      try {
        const result = await api.getAftercareGuide(id);
        if (!cancelled) {
          setDetail(result);
          setMessage("관리 타이밍, 단계별 방법, 다음 액션 체크리스트를 확인하세요.");
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "에프터케어 가이드를 불러오지 못했습니다.");
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
      <Button variant="ghost" onPress={() => router.push("/aftercare")}>에프터케어 목록으로</Button>

      <Panel>
        <Stack>
          <Kicker>에프터케어 가이드</Kicker>
          <Heading>{guide?.overview.headline || record?.styleName || "에프터케어 가이드"}</Heading>
          <BodyText>{guide?.overview.summary || message}</BodyText>
          {record ? (
            <Cluster>
              <Chip tone="success">{serviceLabels[record.serviceType] || record.serviceType}</Chip>
              <Chip>시술일: {formatDate(record.serviceDate)}</Chip>
              <Chip>재방문: {nextVisitDate(record.serviceDate, record.nextVisitTargetDays)}</Chip>
            </Cluster>
          ) : null}
          {record?.generationId ? (
            <Button onPress={() => router.push(`/result/${record.generationId}`)}>헤어 결과 열기</Button>
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
                  <Chip tone="success">타이밍: {section.timing}</Chip>
                  <Kicker>관리 단계</Kicker>
                  {section.steps.map((step, index) => (
                    <BodyText key={`${key}-step-${index}`}>{index + 1}. {step}</BodyText>
                  ))}
                  <Kicker>추천 제품</Kicker>
                  <Cluster>
                    {section.products.map((product) => (
                      <Chip key={product} tone="success">{product}</Chip>
                    ))}
                  </Cluster>
                  <Kicker>피해야 할 것</Kicker>
                  {section.avoid.map((item) => (
                    <BodyText key={item}>- {item}</BodyText>
                  ))}
                </Stack>
              </Card>
            );
          })}

          <Panel>
            <Stack>
              <Heading>관리 일정</Heading>
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
              <Kicker>주의사항</Kicker>
              {guide.warnings.map((warning) => (
                <BodyText key={warning}>- {warning}</BodyText>
              ))}
            </Stack>
          </Card>

          <Card>
            <Stack>
              <Kicker>다음 액션</Kicker>
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
