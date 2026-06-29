export interface FooterBusinessInfoRow {
  label: string;
  value: string;
  href?: string;
}

// Footer business details are intentionally kept in one file so legal/company
// copy can be updated without editing the footer component layout.
export const footerBusinessInfo = {
  heading: "사업자정보",
  rows: [
    { label: "상호", value: "HairFit" },
    { label: "대표자", value: "대표자명 입력" },
    { label: "사업자등록번호", value: "000-00-00000" },
    { label: "통신판매업 신고번호", value: "제0000-지역-0000호" },
    { label: "주소", value: "사업장 주소 입력" },
    {
      label: "고객센터",
      value: "support@hairfit.beauty",
      href: "mailto:support@hairfit.beauty",
    },
  ] satisfies FooterBusinessInfoRow[],
} as const;
