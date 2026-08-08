"use client";

import { Button } from "../../ui/Button";

export function PublicBriefActions() {
  return <Button type="button" variant="secondary" onClick={() => window.print()}>인쇄 또는 PDF 저장</Button>;
}
