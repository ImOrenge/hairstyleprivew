from __future__ import annotations

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "hairfit-payment-product-catalog-2026-08-03.pdf"
REGULAR_FONT_PATH = Path(r"C:\Windows\Fonts\malgun.ttf")
BOLD_FONT_PATH = Path(r"C:\Windows\Fonts\malgunbd.ttf")

INK = colors.HexColor("#18212f")
MUTED = colors.HexColor("#5f6b7a")
LINE = colors.HexColor("#d9e0e8")
PALE = colors.HexColor("#f4f7fb")
ACCENT = colors.HexColor("#e16b4d")
ACCENT_PALE = colors.HexColor("#fff1ec")


def money(value: int) -> str:
    return f"{value:,}원"


def register_fonts() -> None:
    if not REGULAR_FONT_PATH.exists() or not BOLD_FONT_PATH.exists():
        raise FileNotFoundError(
            "맑은 고딕 폰트가 필요합니다: C:\\Windows\\Fonts\\malgun.ttf, malgunbd.ttf"
        )
    pdfmetrics.registerFont(TTFont("Malgun", str(REGULAR_FONT_PATH)))
    pdfmetrics.registerFont(TTFont("Malgun-Bold", str(BOLD_FONT_PATH)))


def styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "CatalogTitle",
            parent=base["Title"],
            fontName="Malgun-Bold",
            fontSize=24,
            leading=32,
            textColor=INK,
            alignment=TA_LEFT,
            spaceAfter=4,
        ),
        "subtitle": ParagraphStyle(
            "CatalogSubtitle",
            parent=base["Normal"],
            fontName="Malgun",
            fontSize=10,
            leading=16,
            textColor=MUTED,
            spaceAfter=10,
        ),
        "section": ParagraphStyle(
            "Section",
            parent=base["Heading2"],
            fontName="Malgun-Bold",
            fontSize=14,
            leading=20,
            textColor=INK,
            spaceBefore=12,
            spaceAfter=7,
        ),
        "body": ParagraphStyle(
            "Body",
            parent=base["BodyText"],
            fontName="Malgun",
            fontSize=8.8,
            leading=15,
            textColor=INK,
            spaceAfter=5,
        ),
        "small": ParagraphStyle(
            "Small",
            parent=base["BodyText"],
            fontName="Malgun",
            fontSize=7.4,
            leading=11,
            textColor=MUTED,
            spaceAfter=4,
        ),
        "table_head": ParagraphStyle(
            "TableHead",
            parent=base["BodyText"],
            fontName="Malgun-Bold",
            fontSize=7.5,
            leading=10,
            textColor=colors.white,
        ),
        "table_cell": ParagraphStyle(
            "TableCell",
            parent=base["BodyText"],
            fontName="Malgun",
            fontSize=7.5,
            leading=10,
            textColor=INK,
        ),
        "table_cell_small": ParagraphStyle(
            "TableCellSmall",
            parent=base["BodyText"],
            fontName="Malgun",
            fontSize=6.8,
            leading=9,
            textColor=INK,
        ),
        "note": ParagraphStyle(
            "Note",
            parent=base["BodyText"],
            fontName="Malgun",
            fontSize=8,
            leading=13,
            textColor=INK,
            leftIndent=8,
            rightIndent=8,
            spaceBefore=4,
            spaceAfter=4,
        ),
    }


def paragraph(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(text, style)


def make_table(rows, widths, style_set, small=False):
    cell_style = style_set["table_cell_small" if small else "table_cell"]
    table_rows = []
    for row_index, row in enumerate(rows):
        current_style = style_set["table_head"] if row_index == 0 else cell_style
        table_rows.append([paragraph(str(value), current_style) for value in row])

    table = Table(table_rows, colWidths=widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), INK),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("GRID", (0, 0), (-1, -1), 0.35, LINE),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, PALE]),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return table


def note_box(text: str, style_set):
    table = Table([[paragraph(text, style_set["note"])]], colWidths=[170 * mm])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), ACCENT_PALE),
                ("BOX", (0, 0), (-1, -1), 0.7, ACCENT),
                ("LINEBEFORE", (0, 0), (0, -1), 3, ACCENT),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 9),
                ("RIGHTPADDING", (0, 0), (-1, -1), 9),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return table


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


def build_pdf():
    register_fonts()
    style_set = styles()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        rightMargin=20 * mm,
        leftMargin=20 * mm,
        topMargin=22 * mm,
        bottomMargin=19 * mm,
        title="HairFit 결제 상품 카탈로그",
        author="제이코더랩",
        subject="HairFit PortOne payment catalog",
    )

    story = [
        paragraph("HairFit 결제 상품 카탈로그", style_set["title"]),
        paragraph("PortOne 단건 결제 및 정기결제 상품 매핑", style_set["subtitle"]),
        make_table(
            [
                ["기준일", "2026-08-03", "상호", "제이코더랩"],
                ["서비스 브랜드", "HairFit", "통화", "KRW"],
                ["문서 성격", "내부 운영용", "결제 채널", "PortOne"],
            ],
            [24 * mm, 57 * mm, 24 * mm, 65 * mm],
            style_set,
        ),
        Spacer(1, 8),
        note_box(
            "핵심 원칙: 상품의 서비스 기간을 결제 유형별로 분류합니다. 정기결제는 한 번의 결제로 결제일 기준 한 달 이용을 제공하고, 추가 이용권은 기간형이 아닌 크레딧 소진형입니다.",
            style_set,
        ),
        paragraph("1. PortOne 정기결제 상품", style_set["section"]),
        paragraph(
            "웹 카드 빌링키를 발급한 뒤 첫 결제를 처리하고 이후 월 단위로 갱신합니다. 금액은 billing-plan.ts 기본값이며 PRICING_&lt;PLAN&gt;_PRICE_KRW 환경변수로 조정될 수 있습니다.",
            style_set["body"],
        ),
        make_table(
            [
                ["상품", "상품 키", "기본 금액", "크레딧", "서비스 기간", "최대 1개월"],
                ["Basic", "basic", money(9900) + "/월", "80", "결제일 기준 1개월", "예"],
                ["Standard", "standard", money(19900) + "/월", "200", "결제일 기준 1개월", "예"],
                ["Pro", "pro", money(49900) + "/월", "600", "결제일 기준 1개월", "예"],
                ["Salon", "salon", money(39900) + "/월", "500", "결제일 기준 1개월", "예"],
            ],
            [24 * mm, 25 * mm, 30 * mm, 22 * mm, 39 * mm, 30 * mm],
            style_set,
            small=True,
        ),
        paragraph(
            "Salon은 selfServe=false로 일반 사용자 직접 결제에서 제외되며 B2B 문의로 운영합니다. 정기결제의 한 번 결제분은 결제일 기준 최대 한 달 이용으로 분류합니다.",
            style_set["small"],
        ),
        PageBreak(),
        paragraph("2. PortOne 단건 결제 상품", style_set["section"]),
        paragraph(
            "추가 이용권은 활성 유료 구독자만 구매할 수 있습니다. 기간형 구독이 아니라 크레딧 소진형 상품이므로 서비스 기간은 별도로 두지 않습니다.",
            style_set["body"],
        ),
        make_table(
            [
                ["상품", "상품 키", "기본 금액", "크레딧", "서비스 기간", "최대 1개월"],
                ["추가 이용권 30", "usage30", money(5900), "30", "기간 없음(크레딧 소진형)", "해당 없음"],
                ["추가 이용권 80", "usage80", money(13900), "80", "기간 없음(크레딧 소진형)", "해당 없음"],
                ["추가 이용권 200", "usage200", money(29900), "200", "기간 없음(크레딧 소진형)", "해당 없음"],
            ],
            [32 * mm, 26 * mm, 30 * mm, 22 * mm, 37 * mm, 23 * mm],
            style_set,
            small=True,
        ),
        Spacer(1, 8),
        note_box(
            "서비스 기간 요약: 정기결제 상품은 결제일 기준 1개월(최대 1개월: 예), 추가 이용권은 기간 없음(최대 1개월: 해당 없음), Free는 결제 및 서비스 기간 없음(최대 1개월: 해당 없음)입니다.",
            style_set,
        ),
        paragraph("3. 서비스 기간 분류 요약", style_set["section"]),
        make_table(
            [
                ["상품 분류", "서비스 기간", "최대 1개월", "분류 기준"],
                ["정기결제 Basic/Standard/Pro/Salon", "결제일 기준 1개월", "예", "한 번의 결제로 한 달 이용 권한과 월 크레딧 제공"],
                ["추가 이용권 30/80/200", "기간 없음(크레딧 소진형)", "해당 없음", "활성 유료 구독자에게 별도 크레딧 제공"],
                ["Free", "결제 및 서비스 기간 없음", "해당 없음", "기본 10크레딧 제공"],
            ],
            [45 * mm, 43 * mm, 28 * mm, 54 * mm],
            style_set,
            small=True,
        ),
        Spacer(1, 8),
        paragraph("기준 소스", style_set["section"]),
        paragraph(
            "my-app/lib/business-info.ts<br/>"
            "my-app/lib/billing-plan.ts<br/>"
            "my-app/lib/usage-pack.ts<br/>"
            "my-app/lib/usage-pack-eligibility.ts<br/>"
            "my-app/app/api/payments/subscribe/route.ts<br/>"
            "my-app/app/api/payments/usage-packs/prepare/route.ts<br/>"
            "my-app/app/api/payments/usage-packs/complete/route.ts",
            style_set["body"],
        ),
        Spacer(1, 10),
        note_box(
            "발행 문서: HairFit 결제 상품 카탈로그 / 상호: 제이코더랩 / 기준일: 2026-08-03",
            style_set,
        ),
    ]

    doc.build(story, onFirstPage=draw_page, onLaterPages=draw_page)
    print(OUTPUT)


if __name__ == "__main__":
    build_pdf()
