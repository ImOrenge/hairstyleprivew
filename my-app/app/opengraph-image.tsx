import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "HairFit — AI 헤어스타일 미리보기";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    <div
      style={{
        background: "linear-gradient(135deg, #fef3c7 0%, #fffbeb 60%, #fef9ee 100%)",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "sans-serif",
        padding: "60px",
      }}
    >
      <div style={{ fontSize: 84, fontWeight: 900, color: "#1c1917", letterSpacing: "-2px" }}>
        HairFit
      </div>
      <div
        style={{
          fontSize: 40,
          fontWeight: 700,
          color: "#d97706",
          marginTop: 20,
          letterSpacing: "-0.5px",
        }}
      >
        AI 헤어스타일 미리보기
      </div>
      <div
        style={{
          fontSize: 26,
          color: "#78716c",
          marginTop: 28,
          textAlign: "center",
          maxWidth: 860,
          lineHeight: 1.5,
        }}
      >
        얼굴형 맞춤 9가지 추천 · 미용실 상담 이미지 저장
      </div>
    </div>,
    { ...size },
  );
}
