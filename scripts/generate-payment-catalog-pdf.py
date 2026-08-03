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
    KeepTogether,
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
    canvas.drawString(doc.leftMargin, 8 * mm, "HairFit / 제이코더랩 - 결제 상품 및 ID 카탈로그")
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
        title="HairFit 결제 상품 및 ID 카탈로그",
        author="제이코더랩",
        subject="HairFit PortOne payment catalog",
    )

    story = [
        paragraph("HairFit 결제 상품 및 ID 카탈로그", style_set["title"]),
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
            "핵심 원칙: PortOne paymentId와 billing-key issueId는 상품별 결제 요청 시 서버에서 생성되는 동적 ID입니다. PDF에는 실결제 ID를 고정하지 않고 생성 규칙과 대조 기준을 기록합니다.",
            style_set,
        ),
        paragraph("1. 결제 ID 규칙", style_set["section"]),
        paragraph(
            "PortOne ID는 결제 요청마다 생성하며, 결제 거래의 중복 방지와 웹훅 매칭을 위해 payment_transactions.provider_order_id에 기록합니다.",
            style_set["body"],
        ),
        make_table(
            [
                ["용도", "생성 형식", "제한", "현재 경로"],
                ["웹 정기결제 첫 결제", "sub-{b|s|p}-{base36 timestamp}-{random}", "32자 이하", "POST /api/payments/subscribe"],
                ["모바일 PortOne", "mob-{b|s|p}-{base36 timestamp}-{random}", "32자 이하", "POST /api/mobile/payments/prepare"],
                ["추가 이용권 단건결제", "use-{30|80|200}-{base36 timestamp}-{random}", "32자 이하", "POST /api/payments/usage-packs/prepare"],
                ["빌링키 발급 요청", "bki-{b|s|p}-{base36 timestamp}-{random}", "40자 이하", "POST /api/payments/billing-key/prepare"],
            ],
            [32 * mm, 77 * mm, 20 * mm, 41 * mm],
            style_set,
            small=True,
        ),
        Spacer(1, 8),
        paragraph(
            "플랜 코드는 basic=b, standard=s, pro=p입니다. 실제 ID는 Date.now()의 base36 값과 crypto.randomUUID() 기반 난수로 만들어집니다.",
            style_set["small"],
        ),
        paragraph("2. PortOne 정기결제 상품", style_set["section"]),
        paragraph(
            "웹 카드 빌링키를 발급한 뒤 첫 결제를 처리하고 이후 월 단위로 갱신합니다. 금액은 billing-plan.ts 기본값이며 PRICING_&lt;PLAN&gt;_PRICE_KRW 환경변수로 조정될 수 있습니다.",
            style_set["body"],
        ),
        make_table(
            [
                ["상품", "상품 키", "기본 금액", "크레딧", "결제 ID"],
                ["Basic", "basic", money(9900) + "/월", "80", "sub-b-..."],
                ["Standard", "standard", money(19900) + "/월", "200", "sub-s-..."],
                ["Pro", "pro", money(49900) + "/월", "600", "sub-p-..."],
                ["Salon", "salon", money(39900) + "/월", "500", "B2B 문의"],
            ],
            [31 * mm, 30 * mm, 38 * mm, 28 * mm, 53 * mm],
            style_set,
        ),
        paragraph(
            "Salon은 selfServe=false로 일반 사용자 직접 결제에서 제외됩니다. 정기결제 빌링키 발급 요청에는 bki-b-..., bki-s-..., bki-p-... 형식의 issueId가 사용됩니다.",
            style_set["small"],
        ),
        KeepTogether(
            [
                paragraph("3. 한달 이용 가능 확인사항", style_set["section"]),
                paragraph(
                    "정기결제 첫 결제가 승인되었다고 한달 이용 권한이 자동으로 완결되는 것은 아닙니다. 아래 조건이 모두 맞아야 현재 이용 기간 동안 기능과 크레딧이 정상 제공됩니다.",
                    style_set["body"],
                ),
                make_table(
                    [
                        ["시점", "확인 항목", "통과 기준", "기준 경로"],
                        ["결제 직후", "PortOne 결제 확정", "PAID + 예상 금액/통화/사용자 일치", "confirmPortonePayment"],
                        ["구독 생성", "구독 권한", "status=active + billing_provider=portone", "subscribe route"],
                        ["기간 계산", "한달 이용 기간", "시작일에서 다음 달 기준일까지 current_period_end 기록", "user_subscriptions"],
                        ["크레딧 지급", "월 이용량", "Basic 80 / Standard 200 / Pro 600을 1회 지급", "grant_subscription_credits"],
                        ["이용 중", "권한 유지", "기간 종료 전 + status active/trialing", "subscription read model"],
                        ["만료 시점", "갱신 또는 종료", "갱신 성공만 다음 기간과 크레딧을 연장", "renewal + webhook"],
                    ],
                    [24 * mm, 37 * mm, 77 * mm, 42 * mm],
                    style_set,
                    small=True,
                ),
                paragraph(
                    "운영 테스트에서는 paymentId, provider_order_id, current_period_end, 현재 크레딧을 한 묶음으로 확인하고 중복 웹훅에 의한 이중 지급이 없는지 확인합니다.",
                    style_set["small"],
                ),
            ]
        ),
        paragraph("4. PortOne 단건 결제 상품", style_set["section"]),
        paragraph(
            "추가 이용권은 활성 유료 구독자만 구매할 수 있습니다. 결제 준비 시 상품 키에 맞춘 use-30-..., use-80-..., use-200-... 형식의 paymentId를 생성합니다.",
            style_set["body"],
        ),
        make_table(
            [
                ["상품", "상품 키", "기본 금액", "크레딧", "결제 ID"],
                ["추가 이용권 30", "usage30", money(5900), "30", "use-30-..."],
                ["추가 이용권 80", "usage80", money(13900), "80", "use-80-..."],
                ["추가 이용권 200", "usage200", money(29900), "200", "use-200-..."],
            ],
            [38 * mm, 31 * mm, 38 * mm, 28 * mm, 45 * mm],
            style_set,
        ),
        Spacer(1, 8),
        note_box(
            "Free는 결제 상품이 아니며 기본 10크레딧을 제공합니다. PortOne 금액은 PRICING_&lt;PLAN&gt;_PRICE_KRW 환경변수가 설정되면 기본값과 달라질 수 있습니다.",
            style_set,
        ),
        PageBreak(),
        paragraph("5. 운영 체크리스트", style_set["section"]),
        paragraph("결제 상품을 추가하거나 ID를 변경할 때 다음 항목을 함께 확인합니다.", style_set["body"]),
        make_table(
            [
                ["순서", "확인 항목", "기준 소스"],
                ["1", "PortOne 상품 키, 금액, 주문명", "my-app/lib/billing-plan.ts, usage-pack.ts"],
                ["2", "paymentId와 issueId 길이/소스 코드", "my-app/lib/portone-payment-id.ts"],
                ["3", "결제 준비/검증/완료 API 연결", "my-app/app/api/payments"],
                ["4", "한달 이용 기간과 갱신 결과", "user_subscriptions.current_period_end"],
                ["5", "실결제 후 거래 ID 대조", "payment_transactions.provider_order_id"],
            ],
            [15 * mm, 82 * mm, 83 * mm],
            style_set,
        ),
        paragraph("기준 소스", style_set["section"]),
        paragraph(
            "my-app/lib/business-info.ts<br/>"
            "my-app/lib/billing-plan.ts<br/>"
            "my-app/lib/usage-pack.ts<br/>"
            "my-app/lib/portone-payment-id.ts<br/>"
            "my-app/app/api/payments/subscribe/route.ts<br/>"
            "my-app/app/api/payments/usage-packs/prepare/route.ts<br/>"
            "my-app/app/api/payments/usage-packs/complete/route.ts",
            style_set["body"],
        ),
        Spacer(1, 10),
        note_box(
            "발행 문서: HairFit 결제 상품 및 ID 카탈로그 / 상호: 제이코더랩 / 기준일: 2026-08-03",
            style_set,
        ),
    ]

    doc.build(story, onFirstPage=draw_page, onLaterPages=draw_page)
    print(OUTPUT)


if __name__ == "__main__":
    build_pdf()
