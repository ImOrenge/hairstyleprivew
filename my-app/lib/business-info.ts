export interface FooterBusinessInfoRow {
  label: string;
  value: string;
  href?: string;
}

// Edit this file to update the public footer business details.
export const footerBusinessInfo = {
  heading: "사업자정보",
  rows: [
    { label: "상호", value: "Hair Fit(제이코더랩)" },
    { label: "대표자", value: "장민기" },
    { label: "사업자등록번호", value: "736-42-01637" },
    { label: "사업자등록일", value: "2026년 06월 29일" },
    {
      label: "연락처",
      value: "010-6350-0913",
      href: "tel:+821063500913",
    },
    {
      label: "고객센터",
      value: "support@hairfit.beauty",
      href: "mailto:support@hairfit.beauty",
    },
  ] satisfies FooterBusinessInfoRow[],
} as const;
