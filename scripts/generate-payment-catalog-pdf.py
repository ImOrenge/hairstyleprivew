from __future__ import annotations

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "hairfit-payment-product-catalog-2026-08-25.pdf"
REGULAR_FONT_PATH = Path(r"C:\Windows\Fonts\malgun.ttf")
BOLD_FONT_PATH = Path(r"C:\Windows\Fonts\malgunbd.ttf")

INK = colors.HexColor("#18212f")
MUTED = colors.HexColor("#5f6b7a")
LINE = colors.HexColor("#d9e0e8")
PALE = colors.HexColor("#f4f7fb")
ACCENT = colors.HexColor("#e16b4d")
ACCENT_PALE = colors.HexColor("#fff1ec")


def register_fonts() -> None:
    if not REGULAR_FONT_PATH.exists() or not BOLD_FONT_PATH.exists():
        raise FileNotFoundError("맑은 고딕 폰트가 필요합니다.")
    pdfmetrics.registerFont(TTFont("Malgun", str(REGULAR_FONT_PATH)))
    pdfmetrics.registerFont(TTFont("Malgun-Bold", str(BOLD_FONT_PATH)))


def styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("Title", parent=base["Title"], fontName="Malgun-Bold", fontSize=23, leading=30, textColor=INK, alignment=TA_LEFT, spaceAfter=4),
        "subtitle": ParagraphStyle("Subtitle", parent=base["Normal"], fontName="Malgun", fontSize=10, leading=16, textColor=MUTED, spaceAfter=10),
        "section": ParagraphStyle("Section", parent=base["Heading2"], fontName="Malgun-Bold", fontSize=14, leading=20, textColor=INK, spaceBefore=10, spaceAfter=6),
        "body": ParagraphStyle("Body", parent=base["BodyText"], fontName="Malgun", fontSize=8.6, leading=14, textColor=INK, spaceAfter=5),
        "small": ParagraphStyle("Small", parent=base["BodyText"], fontName="Malgun", fontSize=7.2, leading=11, textColor=MUTED, spaceAfter=4),
        "table_head": ParagraphStyle("TableHead", parent=base["BodyText"], fontName="Malgun-Bold", fontSize=7, leading=9, textColor=colors.white),
        "table_cell": ParagraphStyle("TableCell", parent=base["BodyText"], fontName="Malgun", fontSize=7, leading=9.5, textColor=INK),
        "table_cell_small": ParagraphStyle("TableCellSmall", parent=base["BodyText"], fontName="Malgun", fontSize=6.2, leading=8.2, textColor=INK),
        "note": ParagraphStyle("Note", parent=base["BodyText"], fontName="Malgun", fontSize=8, leading=13, textColor=INK, leftIndent=8, rightIndent=8, spaceBefore=3, spaceAfter=3),
    }


def paragraph(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(text, style)


def make_table(rows, widths, style_set, small=False):
    body_style = style_set["table_cell_small" if small else "table_cell"]
    rendered = []
    for row_index, row in enumerate(rows):
        cell_style = style_set["table_head"] if row_index == 0 else body_style
        rendered.append([paragraph(str(value), cell_style) for value in row])
    table = Table(rendered, colWidths=widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.35, LINE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, PALE]),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return table


def note_box(text: str, style_set):
    table = Table([[paragraph(text, style_set["note"])]], colWidths=[170 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), ACCENT_PALE),
        ("BOX", (0, 0), (-1, -1), 0.7, ACCENT),
        ("LINEBEFORE", (0, 0), (0, -1), 3, ACCENT),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return table


def bullets(items: list[str], style_set):
    return [paragraph(f"• {item}", style_set["body"]) for item in items]


def draw_page(canvas, doc):
    canvas.saveState()
    width, height = A4
    canvas.setStrokeColor(ACCENT)
    canvas.setLineWidth(2)
    canvas.line(doc.leftMargin, height - 14 * mm, width - doc.rightMargin, height - 14 * mm)
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(doc.leftMargin, 13 * mm, width - doc.rightMargin, 13 * mm)
    canvas.setFont("Malgun", 7)
    canvas.setFillColor(MUTED)
    canvas.drawString(doc.leftMargin, 8 * mm, "HairFit / 제이코더랩 - 결제 상품 카탈로그")
    canvas.drawRightString(width - doc.rightMargin, 8 * mm, f"{doc.page} 페이지")
    canvas.restoreState()


def build_pdf() -> None:
    register_fonts()
    style_set = styles()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUTPUT), pagesize=A4, rightMargin=20 * mm, leftMargin=20 * mm,
        topMargin=22 * mm, bottomMargin=19 * mm,
        title="HairFit 결제 상품 카탈로그", author="제이코더랩",
        subject="HairFit PortOne / KG이니시스 결제 상품 카탈로그",
    )

    story = [
        paragraph("HairFit 결제 상품 카탈로그", style_set["title"]),
        paragraph("PortOne / KG이니시스 신규 판매 상품 V3", style_set["subtitle"]),
        make_table([
            ["기준일", "2026-08-25", "상호", "제이코더랩"],
            ["서비스", "HairFit", "통화", "KRW"],
            ["문서 성격", "결제 상품 안내", "결제 연동", "PortOne / KG이니시스"],
        ], [24 * mm, 57 * mm, 24 * mm, 65 * mm], style_set),
        Spacer(1, 8),
        note_box("모든 금액은 부가가치세가 포함된 실제 승인 총액입니다. 결제 요청 금액은 고객 화면이 아니라 서버의 활성 상품·가격 버전을 기준으로 확정합니다.", style_set),
        paragraph("1. 신규 판매 상품", style_set["section"]),
        paragraph("모든 유료 상품은 얼굴·모발 분석, 정밀 퍼스널 컬러, 헤어 3×3과 최종 1개 확정, 염색·메이크업·패션 디렉팅, Salon Brief, AI 결과 리포트·PDF 및 애프터케어를 포함합니다.", style_set["body"]),
        make_table([
            ["상품", "승인 총액", "결제 방식", "제공 회차", "전체 재시작", "AI 사후상담", "보관"],
            ["Private Hair Direction", "59,000원", "단건", "1회", "1회", "D+30 1회", "60일"],
            ["Total Image Direction", "129,000원<br/>/3개월", "3개월<br/>자동갱신", "주기당 1회", "2회", "D+30·60·90<br/>3회", "90일"],
            ["Signature Style Membership", "412,800원<br/>/년", "연간<br/>자동갱신", "연 4회", "각 상담 5회", "각 상담<br/>3회", "365일"],
        ], [30 * mm, 27 * mm, 25 * mm, 23 * mm, 23 * mm, 27 * mm, 15 * mm], style_set, small=True),
        Spacer(1, 7),
        note_box("Signature Style Membership 412,800원은 Total Image Direction 4회 총액 516,000원에서 정확히 20% 할인한 금액입니다. 연간 회차당 기준 금액은 103,200원입니다.", style_set),
        paragraph("2. KG/PortOne 상품 코드", style_set["section"]),
        make_table([
            ["상품", "상품 코드", "가격 버전", "승인 금액"],
            ["Private Hair Direction", "hairfit-full-style-once-v3", "V3", "59,000원"],
            ["Total Image Direction", "hairfit-full-style-quarterly-v3", "V3", "129,000원"],
            ["Signature Style Membership", "hairfit-full-style-annual-v3", "V3", "412,800원"],
        ], [35 * mm, 77 * mm, 23 * mm, 35 * mm], style_set, small=True),
        PageBreak(),
        paragraph("3. 이용·갱신 정책", style_set["section"]),
        *bullets([
            "Total Image Direction은 3개월마다 풀 스타일 1회를, Signature Style Membership은 1년 동안 풀 스타일 4회를 제공합니다.",
            "미사용 회차는 다음 계약 기간으로 이월되지 않습니다.",
            "정기 상품은 다음 결제 전에 기간말 해지를 신청할 수 있고, 현재 권리는 계약 만료일까지 유지됩니다.",
            "신규 판매에는 V3 snapshot을 사용하며 기존 계약은 구매 당시 가격·회차·갱신·환불 기준을 유지합니다.",
            "무료 데모는 결제 상품이 아닙니다.",
        ], style_set),
        paragraph("4. 청약철회·환불 정책", style_set["section"]),
        *bullets([
            "계약 문서를 받은 날부터 법정 청약철회 기간인 7일 이내에 환불을 신청할 수 있습니다. 서비스 제공이 더 늦게 시작되면 관련 법령에 따라 제공 시작일이 기준이 될 수 있습니다.",
            "유료 상담 회차를 시작하면 7일 이내라도 해당 회차의 단순 변심 환불이 제한됩니다.",
            "법정 기간이 지나면 미사용 상태라도 단순 변심 환불은 제공하지 않으며, 정기 상품은 기간말 해지로 다음 결제를 중지할 수 있습니다.",
            "Signature Style Membership의 법정 기한 내 미시작 회차는 결제 당시 snapshot의 회차당 103,200원을 기준으로 계산합니다.",
            "중복·오결제, 미승인 결제, HairFit 책임의 결과 미제공, 계약과 중요한 부분이 다른 서비스는 별도 예외 심사를 진행합니다.",
        ], style_set),
        paragraph("5. 레거시 상품", style_set["section"]),
        paragraph("Basic·Standard·Pro·Salon 및 추가 이용권 S·M·L은 신규 판매를 종료했습니다. 기존 계약 고객은 해지 시까지 구매 당시 가격·갱신·사용권 snapshot을 유지합니다. Salon은 B2B 문의 경로로만 운영합니다.", style_set["body"]),
        paragraph("6. 결제 정합성", style_set["section"]),
        *bullets([
            "결제 준비 API는 서버 카탈로그의 offeringKey, 상품 버전 및 가격 버전을 사용합니다.",
            "PortOne/KG이니시스 승인 금액과 서버의 준비 결제 금액이 일치할 때만 사용권을 발급합니다.",
            "구매 완료 시 상품·가격·혜택 snapshot을 계약에 고정하고 환불·갱신·권리 판정에도 재사용합니다.",
        ], style_set),
        Spacer(1, 9),
        note_box("발행 문서: HairFit 결제 상품 카탈로그 / 상호: 제이코더랩 / 기준일: 2026-08-25", style_set),
    ]
    doc.build(story, onFirstPage=draw_page, onLaterPages=draw_page)
    print(OUTPUT)


if __name__ == "__main__":
    build_pdf()
