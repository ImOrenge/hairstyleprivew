import { Card, Chip, Cluster, Screen, Stack } from "@hairfit/ui-native";
import {
  AdminEmptyCard,
  AdminFilterBar,
  AdminListHeader,
  AdminPageHeader,
  AdminTabs,
} from "../../lib/admin-ui";

export default function AdminReviewsScreen() {
  return (
    <Screen>
      <AdminTabs activePath="/admin/reviews" />

      <AdminPageHeader title="리뷰관리" countLabel="총 0건" description="리뷰 노출 상태와 숨김 사유를 관리합니다.">
        <AdminFilterBar
          filters={["전체", "노출", "숨김"]}
          queryPlaceholder="리뷰 내용 / user id / generation id 검색"
        />
      </AdminPageHeader>

      <AdminListHeader columns={["평점", "작성자", "상태", "액션"]} />

      <Stack>
        <Card>
          <Cluster>
            <Chip tone="success">노출</Chip>
            <Chip tone="danger">숨김</Chip>
            <Chip>복원</Chip>
            <Chip>삭제</Chip>
          </Cluster>
        </Card>
        <AdminEmptyCard>리뷰가 없습니다.</AdminEmptyCard>
      </Stack>
    </Screen>
  );
}
