import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import {
  BodyText,
  Button,
  Card,
  Chip,
  Cluster,
  Heading,
  Kicker,
  MetricGrid,
  MetricTile,
  Panel,
  Stack,
  TextField,
} from "@hairfit/ui-native";

const adminTabs = [
  { label: "회원관리", path: "/admin/members" },
  { label: "B2B", path: "/admin/b2b" },
  { label: "메일함", path: "/admin/inbox" },
  { label: "리뷰관리", path: "/admin/reviews" },
  { label: "통계", path: "/admin/stats" },
] as const;

export function AdminTabs({ activePath }: { activePath: string }) {
  const router = useRouter();

  return (
    <Cluster gap={8}>
      {adminTabs.map((tab) => (
        <Button
          key={tab.path}
          variant={activePath === tab.path ? "primary" : "secondary"}
          onPress={() => router.push(tab.path)}
        >
          {tab.label}
        </Button>
      ))}
    </Cluster>
  );
}

export function AdminPageHeader({
  children,
  countLabel,
  description,
  kicker = "관리자 대시보드",
  title,
}: {
  children?: ReactNode;
  countLabel?: string;
  description?: string;
  kicker?: string;
  title: string;
}) {
  return (
    <Panel>
      <Stack>
        <Kicker>{kicker}</Kicker>
        <Heading>{title}</Heading>
        {description ? <BodyText>{description}</BodyText> : null}
        {countLabel ? <BodyText>{countLabel}</BodyText> : null}
        {children}
      </Stack>
    </Panel>
  );
}

export function AdminFilterBar({
  filters,
  queryPlaceholder,
}: {
  filters: readonly string[];
  queryPlaceholder: string;
}) {
  return (
    <Stack>
      <TextField placeholder={queryPlaceholder} />
      <Cluster>
        {filters.map((filter, index) => (
          <Chip key={filter} tone={index === 0 ? "accent" : "neutral"}>
            {filter}
          </Chip>
        ))}
      </Cluster>
    </Stack>
  );
}

export function AdminSummaryGrid({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <MetricGrid>
      {items.map((item) => (
        <MetricTile key={item.label} label={item.label} value={item.value} />
      ))}
    </MetricGrid>
  );
}

export function AdminListHeader({ columns }: { columns: string[] }) {
  return (
    <Card>
      <Cluster>
        {columns.map((column) => (
          <Chip key={column}>{column}</Chip>
        ))}
      </Cluster>
    </Card>
  );
}

export function AdminEmptyCard({ children }: { children: ReactNode }) {
  return (
    <Card>
      <BodyText>{children}</BodyText>
    </Card>
  );
}
