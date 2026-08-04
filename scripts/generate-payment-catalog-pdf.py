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
        paragraph("웹 PortOne 단건 결제 및 정기결제 이용권", style_set["subtitle"]),
        make_table(
            [
                ["기준일", "2026-08-03 (수정 2026-08-04)", "상호", "제이코더랩"],
                ["서비스 브랜드", "HairFit", "통화", "KRW"],
                ["문서 성격", "상품 안내용", "결제 채널", "웹 PortOne"],
            ],
            [24 * mm, 57 * mm, 24 * mm, 65 * mm],
            style_set,
        ),
        Spacer(1, 8),
        note_box(
            "횟수 안내: 표시 횟수는 각 서비스를 단독으로 이용할 때의 최대치이며 실제 횟수는 서비스 조합에 따라 달라질 수 있습니다. 패션 1세트는 헤어 1회와 패션 1회를 함께 이용하는 기준입니다. 케어 최초 1회 무료는 계정당 별도 혜택이며 상품의 케어 횟수에 포함하지 않습니다.",
            style_set,
        ),
        paragraph("1. 정기결제 이용권", style_set["section"]),
        paragraph(
            "웹 카드 빌링키를 발급한 뒤 첫 결제를 처리하고 이후 월 단위로 갱신합니다. 아래 금액은 현재 기본 판매가 기준입니다.",
            style_set["body"],
        ),
        make_table(
            [
                ["상품", "기본 금액", "헤어<br/>이용권", "패션<br/>이용권", "케어<br/>이용권", "구매 후<br/>사용기간", "최대<br/>1개월"],
                ["Basic", money(9900) + "/월", "8회", "2세트", "2회", "결제일 기준<br/>1개월", "예"],
                ["Standard", money(19900) + "/월", "20회", "6세트", "6회", "결제일 기준<br/>1개월", "예"],
                ["Pro", money(49900) + "/월", "60회", "20세트", "20회", "결제일 기준<br/>1개월", "예"],
                ["Salon", money(39900) + "/월", "50회", "16세트", "16회", "결제일 기준<br/>1개월", "예"],
            ],
            [22 * mm, 26 * mm, 22 * mm, 24 * mm, 22 * mm, 34 * mm, 20 * mm],
            style_set,
            small=True,
        ),
        paragraph(
            "Salon은 일반 사용자 직접 결제에서 제외되며 B2B 문의로 운영합니다. 정기결제의 한 번 결제분은 결제일 기준 최대 한 달 이용으로 분류합니다.",
            style_set["small"],
        ),
        PageBreak(),
        paragraph("2. 단건 결제 추가 이용권", style_set["section"]),
        paragraph(
            "추가 이용권은 활성 유료 구독자만 구매할 수 있습니다. 구매 후 사용기간은 이용권 소진 시까지이며 정기결제의 한 달 사용기간과 별도로 운영합니다.",
            style_set["body"],
        ),
        make_table(
            [
                ["상품", "기본 금액", "헤어<br/>이용권", "패션<br/>이용권", "케어<br/>이용권", "구매 후<br/>사용기간", "최대<br/>1개월"],
                ["추가 이용권 S", money(5900), "3회", "1세트", "1회", "이용권 소진<br/>시까지", "아니오"],
                ["추가 이용권 M", money(13900), "8회", "2세트", "2회", "이용권 소진<br/>시까지", "아니오"],
                ["추가 이용권 L", money(29900), "20회", "6세트", "6회", "이용권 소진<br/>시까지", "아니오"],
            ],
            [27 * mm, 27 * mm, 21 * mm, 24 * mm, 21 * mm, 32 * mm, 18 * mm],
            style_set,
            small=True,
        ),
        Spacer(1, 8),
        note_box(
            "Basic 예시: 헤어 8회, 패션 2세트, 케어 2회 이용권입니다. 최초 케어 1회 무료를 사용하지 않은 계정은 무료 혜택 1회를 별도로 이용할 수 있습니다.",
            style_set,
        ),
        paragraph("3. 서비스 기간 분류 요약", style_set["section"]),
        make_table(
            [
                ["상품 분류", "서비스 기간", "최대 1개월", "분류 기준"],
                ["정기결제 Basic/Standard/Pro/Salon", "결제일 기준 1개월", "예", "한 번의 결제로 한 달 이용권 제공"],
                ["추가 이용권 S/M/L", "이용권 소진 시까지", "아니오", "활성 유료 구독자에게 별도 이용권 제공"],
                ["Free", "결제 상품 아님", "해당 없음", "헤어 1회 및 계정당 최초 케어 1회 무료"],
            ],
            [45 * mm, 43 * mm, 28 * mm, 54 * mm],
            style_set,
            small=True,
        ),
        Spacer(1, 8),
        paragraph("4. 이용권 횟수 안내", style_set["section"]),
        paragraph(
            "헤어 이용권: 헤어 결과 이미지 생성 기준<br/>"
            "패션 이용권: 헤어 1회와 패션 1회를 함께 이용하는 세트 기준<br/>"
            "케어 이용권: 케어 프로그램 생성 기준<br/>"
            "최초 케어 1회 무료 혜택은 계정당 한 번만 제공되며 상품별 케어 이용권 횟수와 별도입니다.",
            style_set["body"],
        ),
        Spacer(1, 10),
        note_box(
            "발행 문서: HairFit 결제 상품 카탈로그 / 상호: 제이코더랩 / 기준일: 2026-08-03 / 수정일: 2026-08-04",
            style_set,
        ),
    ]

    doc.build(story, onFirstPage=draw_page, onLaterPages=draw_page)
    print(OUTPUT)


if __name__ == "__main__":
    build_pdf()
