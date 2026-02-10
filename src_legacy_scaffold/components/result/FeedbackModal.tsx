"use client";

import { useState } from "react";
import { Button } from "../ui/Button";

export function FeedbackModal() {
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        만족도 평가
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-6">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5">
            <h3 className="text-lg font-semibold">결과가 만족스러우셨나요?</h3>
            <p className="mt-1 text-sm text-gray-600">평가 데이터는 모델 개선에 사용됩니다.</p>

            {submitted ? (
              <p className="mt-4 text-sm font-medium text-emerald-700">피드백 감사합니다.</p>
            ) : (
              <div className="mt-4 flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSubmitted(true);
                  }}
                >
                  좋아요
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSubmitted(true);
                  }}
                >
                  아쉬워요
                </Button>
              </div>
            )}

            <div className="mt-5 flex justify-end">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                닫기
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
