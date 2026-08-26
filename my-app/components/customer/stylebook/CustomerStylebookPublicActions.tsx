"use client";

import { Copy, Download, Share2 } from "lucide-react";
import { useState } from "react";

export function CustomerStylebookPublicActions() {
  const [message, setMessage] = useState("");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setMessage("공유 링크를 복사했습니다.");
    } catch {
      setMessage("링크를 복사하지 못했습니다.");
    }
  };
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: "HairFit 스타일북", url });
        setMessage("공유 화면을 열었습니다.");
        return;
      }
      await navigator.clipboard.writeText(url);
      setMessage("공유 링크를 복사했습니다.");
    } catch {
      setMessage("공유를 취소했습니다.");
    }
  };
  return (
    <div className="customer-stylebook-public-actions">
      <button type="button" onClick={() => void share()}><Share2 aria-hidden="true" /> 공유</button>
      <button type="button" onClick={() => void copy()}>
        <Copy aria-hidden="true" /> 링크 복사
      </button>
      <button type="button" onClick={() => window.print()}><Download aria-hidden="true" /> 인쇄·PDF 저장</button>
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}
