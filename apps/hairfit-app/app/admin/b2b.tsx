import { Card, Chip, Cluster, Screen, Stack } from "@hairfit/ui-native";
import {
  AdminEmptyCard,
  AdminFilterBar,
  AdminPageHeader,
  AdminSummaryGrid,
  AdminTabs,
} from "../../lib/admin-ui";

const stages = ["new", "qualified", "negotiation", "contracted", "dropped"];

export default function AdminB2bScreen() {
  return (
    <Screen>
      <AdminTabs activePath="/admin/b2b" />

      <AdminPageHeader title="B2B" countLabel="총 0건" description="도입 문의 리드의 단계와 운영 메모를 관리합니다.">
        <AdminFilterBar filters={["전체 단계", ...stages]} queryPlaceholder="회사명 / 담당자 / 이메일 검색" />
      </AdminPageHeader>

      <AdminSummaryGrid items={stages.map((stage) => ({ label: stage, value: 0 }))} />

      <Stack>
        <Card>
          <Stack gap={10}>
            <Cluster>
              <Chip>관심 플랜</Chip>
              <Chip>지역</Chip>
              <Chip>도입 시점</Chip>
              <Chip>운영 메모</Chip>
            </Cluster>
          </Stack>
        </Card>
        <AdminEmptyCard>리드가 없습니다.</AdminEmptyCard>
      </Stack>
    </Screen>
  );
}
