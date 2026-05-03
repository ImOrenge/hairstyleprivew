import { Card, Chip, Cluster, Screen, Stack } from "@hairfit/ui-native";
import {
  AdminEmptyCard,
  AdminFilterBar,
  AdminListHeader,
  AdminPageHeader,
  AdminTabs,
} from "../../lib/admin-ui";

export default function AdminMembersScreen() {
  return (
    <Screen>
      <AdminTabs activePath="/admin/members" />

      <AdminPageHeader title="회원관리" countLabel="총 0명" description="회원 권한, 온보딩 상태, 크레딧을 확인합니다.">
        <AdminFilterBar
          filters={["전체", "member", "salon_owner", "admin", "미설정"]}
          queryPlaceholder="user id / email / 이름 검색"
        />
      </AdminPageHeader>

      <AdminListHeader columns={["회원", "권한", "크레딧", "액션"]} />

      <Stack>
        <Card>
          <Stack gap={10}>
            <Cluster>
              <Chip>권한 변경</Chip>
              <Chip>상세 열람</Chip>
              <Chip>크레딧 조정</Chip>
            </Cluster>
          </Stack>
        </Card>
        <AdminEmptyCard>조회된 회원이 없습니다.</AdminEmptyCard>
      </Stack>
    </Screen>
  );
}
