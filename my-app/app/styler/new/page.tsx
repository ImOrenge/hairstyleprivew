"use client";

import { Suspense } from "react";
import { StylerNewFeature } from "../../../components/styler/StylerNewFeature";
import { AppPage } from "../../../components/ui/Surface";

export default function StylerNewPage() {
  return (
    <Suspense
      fallback={(
        <AppPage className="max-w-4xl py-12 text-sm text-[var(--app-muted)]">
          패션 추천 화면을 불러오는 중입니다...
        </AppPage>
      )}
    >
      <StylerNewFeature />
    </Suspense>
  );
}
