"use client";

import { AsyncBoundary } from "../components/ui/AsyncBoundary";
import { Button } from "../components/ui/Button";
import { AppPage, Panel } from "../components/ui/Surface";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  const reference = error.digest;

  return (
    <AppPage>
      <Panel className="mx-auto max-w-2xl p-6 sm:p-8">
        <AsyncBoundary
          error={error}
          errorTitle="페이지를 표시하지 못했습니다"
          errorDescription={
            reference
              ? `잠시 후 다시 시도해 주세요. 오류 참조: ${reference}`
              : "잠시 후 다시 시도해 주세요. 문제가 계속되면 고객센터에 알려 주세요."
          }
          errorAction={
            <Button type="button" variant="secondary" onClick={reset}>
              다시 시도
            </Button>
          }
        >
          {null}
        </AsyncBoundary>
      </Panel>
    </AppPage>
  );
}
