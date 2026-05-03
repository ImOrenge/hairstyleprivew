import { Card, Chip, Cluster, Heading, Screen, Stack } from "@hairfit/ui-native";
import {
  AdminEmptyCard,
  AdminFilterBar,
  AdminPageHeader,
  AdminSummaryGrid,
  AdminTabs,
} from "../../lib/admin-ui";

const statusLabels = ["신규", "읽음", "보관됨"];

export default function AdminInboxScreen() {
  return (
    <Screen>
      <AdminTabs activePath="/admin/inbox" />

      <AdminPageHeader
        kicker="관리자 메일함"
        title="수신 메일"
        countLabel="Cloudflare Email Routing으로 들어온 메일 0건"
      >
        <AdminFilterBar
          filters={["전체 상태", ...statusLabels]}
          queryPlaceholder="보낸 사람 / 받는 사람 / 제목 / 미리보기 검색"
        />
      </AdminPageHeader>

      <AdminSummaryGrid items={statusLabels.map((status) => ({ label: status, value: 0 }))} />

      <Stack>
        <Card>
          <Stack gap={10}>
            <Cluster>
              <Chip>봉투 발신자</Chip>
              <Chip>봉투 수신자</Chip>
              <Chip>메시지 ID</Chip>
              <Chip>첨부파일</Chip>
            </Cluster>
            <Heading>메일을 선택하세요.</Heading>
          </Stack>
        </Card>
        <AdminEmptyCard>아직 수신 메일이 없습니다.</AdminEmptyCard>
      </Stack>
    </Screen>
  );
}
