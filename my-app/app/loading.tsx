import { AsyncBoundary } from "../components/ui/AsyncBoundary";
import { AppPage, Panel } from "../components/ui/Surface";

export default function Loading() {
  return (
    <AppPage>
      <Panel className="mx-auto max-w-2xl p-6 sm:p-8">
        <AsyncBoundary pending loadingTitle="페이지를 준비하고 있습니다">
          {null}
        </AsyncBoundary>
      </Panel>
    </AppPage>
  );
}
