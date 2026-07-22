import { AsyncBoundary } from "../../ui/AsyncBoundary";
import { Panel } from "../../ui/Surface";
import { StyleProfileForm } from "../StyleProfileForm";
import { MyPageSectionHeader as SectionHeader } from "../MyPageSectionHeader";

export function MyPageBodyProfilePanel() {
  return (
    <AsyncBoundary>
      <Panel
      id="mypage-panel-body-profile"
      role="tabpanel"
      aria-labelledby="mypage-tab-body-profile"
      as="section"
      className="p-4 sm:p-5"
    >
      <SectionHeader
        title="바디프로필 설정"
        description="저장된 체형 정보와 참고 사진은 패션 추천에 사용됩니다."
      />
      <div className="mt-4">
        <StyleProfileForm variant="dashboard" />
      </div>
      </Panel>
    </AsyncBoundary>
  );
}
