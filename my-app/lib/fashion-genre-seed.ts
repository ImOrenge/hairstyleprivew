import type {
  FashionCatalogRow,
  FashionCatalogSourceSummary,
  FashionGenre,
  FashionRecommendationItem,
} from "./fashion-types";

export interface FashionGenreDefinition {
  genre: FashionGenre;
  labelKo: string;
  descriptionKo: string;
  queryTerms: string[];
  tags: string[];
}

type SeedCatalogEntry = Omit<
  FashionCatalogRow,
  "id" | "market" | "status" | "sourceCycleId" | "sourceSummary" | "createdAt" | "updatedAt"
>;

export const FASHION_GENRE_DEFINITIONS: FashionGenreDefinition[] = [
  {
    genre: "minimal",
    labelKo: "미니멀",
    descriptionKo: "군더더기 없는 색과 선으로 헤어를 또렷하게 보이게 하는 코디",
    queryTerms: ["미니멀룩", "조용한 럭셔리", "베이직 코디", "톤온톤 패션"],
    tags: ["clean", "neutral", "quiet"],
  },
  {
    genre: "street",
    labelKo: "스트릿",
    descriptionKo: "실루엣과 소재 대비가 분명한 트렌디한 일상 코디",
    queryTerms: ["스트릿 패션", "고프코어", "오버핏 코디", "스니커즈 코디"],
    tags: ["oversized", "utility", "sneakers"],
  },
  {
    genre: "casual",
    labelKo: "캐주얼",
    descriptionKo: "반복해서 입기 쉬운 데일리 균형형 코디",
    queryTerms: ["데일리룩", "캐주얼 코디", "주말 코디", "데님 코디"],
    tags: ["daily", "denim", "comfortable"],
  },
  {
    genre: "classic",
    labelKo: "클래식",
    descriptionKo: "시간이 지나도 안정적인 재킷, 셔츠, 로퍼 중심 코디",
    queryTerms: ["클래식룩", "올드머니룩", "트래디셔널 패션", "로퍼 코디"],
    tags: ["tailored", "timeless", "refined"],
  },
  {
    genre: "office",
    labelKo: "오피스",
    descriptionKo: "출근과 미팅에 맞는 단정한 구조감의 코디",
    queryTerms: ["오피스룩", "출근룩", "비즈니스 캐주얼", "블레이저 코디"],
    tags: ["work", "polished", "structured"],
  },
  {
    genre: "date",
    labelKo: "데이트",
    descriptionKo: "얼굴 주변을 부드럽게 살리는 선명한 포인트 코디",
    queryTerms: ["데이트룩", "소개팅룩", "로맨틱 코디", "니트 코디"],
    tags: ["soft", "warm", "romantic"],
  },
  {
    genre: "formal",
    labelKo: "포멀",
    descriptionKo: "행사와 격식 있는 자리에 맞는 절제된 드레스업 코디",
    queryTerms: ["포멀룩", "하객룩", "세미정장", "행사 코디"],
    tags: ["ceremony", "dressy", "elegant"],
  },
  {
    genre: "athleisure",
    labelKo: "애슬레저",
    descriptionKo: "움직임은 편하고 인상은 깔끔한 스포티 코디",
    queryTerms: ["애슬레저룩", "스포티룩", "운동복 코디", "조거팬츠 코디"],
    tags: ["sporty", "active", "easy"],
  },
];

function item(
  slot: FashionRecommendationItem["slot"],
  name: string,
  description: string,
  color: string,
  fit: string,
  material: string,
): FashionRecommendationItem {
  return {
    slot,
    name,
    description,
    color,
    fit,
    material,
    brandName: null,
    productUrl: null,
  };
}

export function getFashionGenreDefinition(genre: FashionGenre) {
  return FASHION_GENRE_DEFINITIONS.find((definition) => definition.genre === genre) || FASHION_GENRE_DEFINITIONS[0];
}

export function buildKoreanWeeklyFashionQueries(referenceDate = new Date()) {
  const year = referenceDate.getFullYear();
  return FASHION_GENRE_DEFINITIONS.flatMap((definition) =>
    definition.queryTerms.map((term) => `${year} ${term} 트렌드`),
  );
}

export function buildSeedFashionSourceSummary(referenceDate = new Date()): FashionCatalogSourceSummary {
  return {
    mode: "seeded-weekly",
    queries: buildKoreanWeeklyFashionQueries(referenceDate),
    notes: "실시간 검색 결과를 사용할 수 없을 때 적용하는 기본 장르별 패션 카탈로그입니다.",
    providers: ["fashion-seed"],
    documentsCollected: 0,
    documentsUsed: 0,
  };
}

export const SEED_FASHION_CATALOG: SeedCatalogEntry[] = [
  {
    slug: "minimal-clean-portrait-balance",
    genre: "minimal",
    headline: "클린 미니멀 실루엣",
    summary: "차분한 색과 짧은 장식으로 선택한 헤어스타일을 가장 또렷하게 보여주는 방향입니다.",
    palette: ["아이보리", "차콜", "쿨 그레이", "블랙"],
    silhouette: "목선은 가볍게 열고 상하의는 직선적으로 정리한 균형형 실루엣",
    items: [
      item("outer", "크롭 싱글 재킷", "허리선에서 끝나는 짧은 재킷으로 얼굴과 헤어 주변을 깔끔하게 둡니다.", "차콜", "레귤러", "코튼 트윌"),
      item("top", "파인 니트 티", "얇은 조직의 니트가 헤어 라인을 방해하지 않고 밝게 받쳐줍니다.", "아이보리", "레귤러", "파인 립 니트"),
      item("bottom", "스트레이트 데님", "과한 워싱 없이 하체 라인을 안정적으로 잡습니다.", "워시드 블루", "스트레이트", "데님"),
      item("shoes", "로우 스니커즈", "전체 인상을 가볍게 유지하는 낮은 형태의 슈즈입니다.", "화이트", "스탠더드", "레더 믹스"),
      item("accessory", "슬림 메탈 워치", "작은 광택만 더해 헤어와 얼굴에 시선을 남깁니다.", "실버", "컴팩트", "메탈"),
    ],
    stylingNotes: [
      "모자나 두꺼운 목도리처럼 헤어를 가리는 아이템은 제외합니다.",
      "컬러 대비는 약하게 두고 소재 차이로만 깊이를 만듭니다.",
      "상체가 답답해 보이면 넥라인을 한 단계 더 열어 조정합니다.",
    ],
    tags: ["minimal", "neutral", "clean", "daily"],
    trendScore: 70,
    freshnessScore: 62,
  },
  {
    slug: "street-utility-layer",
    genre: "street",
    headline: "유틸리티 스트릿 레이어",
    summary: "트렌디한 볼륨과 기능성 소재를 사용하되 얼굴 주변은 열어 헤어를 살리는 스트릿 룩입니다.",
    palette: ["그래파이트", "세이지", "오프화이트", "실버"],
    silhouette: "상체는 여유 있게, 하체는 와이드 테이퍼드로 무게를 잡는 실루엣",
    items: [
      item("outer", "유틸리티 블루종", "포켓 디테일이 스타일의 중심을 잡으면서도 목 주변은 가볍게 둡니다.", "세이지", "릴랙스", "나일론 코튼"),
      item("top", "박시 하프 슬리브", "현재적인 박스 실루엣으로 헤어의 대비를 분명하게 만듭니다.", "오프화이트", "릴랙스", "코튼 저지"),
      item("bottom", "와이드 테이퍼드 팬츠", "다리 쪽 볼륨으로 스트릿 무드를 안정적으로 완성합니다.", "그래파이트", "와이드 테이퍼드", "코튼 블렌드"),
      item("shoes", "청키 러너", "스포티한 무게감을 더해 전체 비율을 잡습니다.", "실버 그레이", "스탠더드", "메시와 스웨이드"),
      item("accessory", "나일론 크로스백", "몸 중심을 사선으로 나눠 룩에 리듬을 줍니다.", "블랙", "스몰", "나일론"),
    ],
    stylingNotes: [
      "오버핏을 쓰더라도 어깨와 목선이 헤어를 덮지 않게 조정합니다.",
      "한 가지 기능성 소재만 강하게 두고 나머지는 단순하게 유지합니다.",
      "체형이 작아 보이면 팬츠 폭을 한 단계 줄입니다.",
    ],
    tags: ["street", "utility", "oversized", "sneakers"],
    trendScore: 78,
    freshnessScore: 74,
  },
  {
    slug: "casual-weekend-denim",
    genre: "casual",
    headline: "데일리 캐주얼 밸런스",
    summary: "주말과 일상에 반복해서 입기 쉬운 구성으로 헤어 결과를 자연스럽게 이어줍니다.",
    palette: ["오트밀", "라이트 블루", "웜 그레이", "브라운"],
    silhouette: "부드러운 상의와 직선적인 데님을 섞은 편안한 데일리 실루엣",
    items: [
      item("outer", "소프트 카디건 재킷", "얼굴 주변에 부드러운 질감을 더하면서 헤어를 가리지 않습니다.", "오트밀", "레귤러", "울 블렌드"),
      item("top", "스쿱넥 저지 톱", "넥라인을 가볍게 열어 얼굴과 헤어가 답답해 보이지 않게 합니다.", "웜 화이트", "레귤러", "모달 코튼"),
      item("bottom", "릴랙스 스트레이트 데님", "편안하지만 흐트러지지 않는 하체 라인을 만듭니다.", "라이트 블루", "스트레이트", "데님"),
      item("shoes", "라운드 플랫 슈즈", "가벼운 일상 무드를 유지합니다.", "브라운", "스탠더드", "소프트 레더"),
      item("accessory", "캔버스 토트", "데일리 실용성을 더하는 작은 포인트입니다.", "내추럴", "미디엄", "캔버스"),
    ],
    stylingNotes: [
      "전체 색을 밝게 쓰면 헤어 컬러와 얼굴 톤이 더 선명하게 보입니다.",
      "체형 보정이 필요하면 상의를 안으로 넣어 허리선을 살립니다.",
      "너무 큰 가방은 전신 룩북에서 비율을 무겁게 만들 수 있습니다.",
    ],
    tags: ["casual", "denim", "weekend", "comfortable"],
    trendScore: 72,
    freshnessScore: 66,
  },
  {
    slug: "classic-tailored-staple",
    genre: "classic",
    headline: "타임리스 클래식 코디",
    summary: "재킷과 셔츠, 로퍼 중심으로 안정적인 인상을 만들고 헤어 변화를 세련되게 받쳐줍니다.",
    palette: ["네이비", "아이보리", "카멜", "버건디"],
    silhouette: "어깨는 단정하게, 하체는 길게 떨어지는 클래식 테일러드 실루엣",
    items: [
      item("outer", "싱글 브레스티드 블레이저", "과하지 않은 구조감으로 얼굴 주변을 정돈합니다.", "네이비", "테일러드", "울 블렌드"),
      item("top", "아이보리 버튼다운 셔츠", "깨끗한 칼라 라인이 헤어스타일을 또렷하게 보여줍니다.", "아이보리", "레귤러", "코튼"),
      item("bottom", "프레스드 트라우저", "세로 주름이 전신 비율을 길게 정리합니다.", "네이비", "스트레이트", "울 블렌드"),
      item("shoes", "페니 로퍼", "클래식한 무드를 안정적으로 마무리합니다.", "버건디", "스탠더드", "레더"),
      item("accessory", "레더 벨트", "상하의 경계를 깔끔하게 잡아줍니다.", "다크 브라운", "슬림", "레더"),
    ],
    stylingNotes: [
      "칼라가 높으면 헤어 볼륨과 부딪힐 수 있으니 첫 단추는 여유 있게 둡니다.",
      "광택 소재는 하나만 사용해 과한 행사복처럼 보이지 않게 합니다.",
      "키가 작게 보이면 재킷 길이를 엉덩이 중간 위로 조정합니다.",
    ],
    tags: ["classic", "tailored", "old-money", "loafers"],
    trendScore: 76,
    freshnessScore: 68,
  },
  {
    slug: "office-polished-structure",
    genre: "office",
    headline: "폴리시드 오피스 룩",
    summary: "출근과 미팅에 바로 쓰기 좋은 단정한 구조감으로 헤어 선택을 전문적으로 보이게 합니다.",
    palette: ["블랙", "소프트 블루", "토프", "실버"],
    silhouette: "절제된 어깨와 긴 하체 라인을 강조한 업무용 실루엣",
    items: [
      item("outer", "칼라리스 블레이저", "깔끔한 앞선이 얼굴과 헤어를 중심에 둡니다.", "블랙", "레귤러", "울 블렌드"),
      item("top", "소프트 블루 셔츠", "차가운 톤이 얼굴 주변을 정돈하고 업무 분위기를 만듭니다.", "소프트 블루", "레귤러", "코튼 포플린"),
      item("bottom", "테이퍼드 슬랙스", "반복 착용에 안정적인 하체 라인입니다.", "토프", "테이퍼드", "폴리 레이온"),
      item("shoes", "스퀘어 로퍼", "편하지만 충분히 단정한 출근용 슈즈입니다.", "블랙", "스탠더드", "레더"),
      item("accessory", "구조적인 숄더백", "업무용 소지품을 담아도 형태가 무너지지 않습니다.", "블랙", "미디엄", "레더"),
    ],
    stylingNotes: [
      "회의나 면접처럼 격식이 필요한 날에는 팔레트를 두 색으로 줄입니다.",
      "목 주변이 답답하면 셔츠 대신 실키한 라운드 톱으로 바꿉니다.",
      "오피스 룩에서도 헤어를 가리는 스카프와 높은 칼라는 피합니다.",
    ],
    tags: ["office", "work", "blazer", "polished"],
    trendScore: 74,
    freshnessScore: 70,
  },
  {
    slug: "date-soft-focus",
    genre: "date",
    headline: "소프트 데이트 포커스",
    summary: "부드러운 질감과 작은 포인트로 얼굴과 헤어 주변을 따뜻하게 보이게 합니다.",
    palette: ["블러시", "크림", "코코아", "골드"],
    silhouette: "부드러운 넥라인과 흐르는 하의로 움직임을 만드는 실루엣",
    items: [
      item("outer", "부클 카디건 재킷", "따뜻한 질감이 헤어의 선을 부드럽게 이어줍니다.", "크림", "레귤러", "부클 니트"),
      item("top", "소프트 브이넥 니트", "얼굴 주변을 자연스럽게 열어 헤어가 돋보입니다.", "블러시", "슬림 레귤러", "캐시미어 블렌드"),
      item("bottom", "플루이드 미디 스커트", "전신 이미지에 우아한 움직임을 줍니다.", "코코아", "A라인", "새틴"),
      item("shoes", "메리제인 플랫", "데이트 무드를 편안하게 유지합니다.", "브라운", "스탠더드", "레더"),
      item("accessory", "델리케이트 네크리스", "얼굴 아래 작은 초점을 만들어줍니다.", "골드", "파인", "메탈"),
    ],
    stylingNotes: [
      "헤어가 긴 경우 상의 장식은 작게 두어 선이 복잡해지지 않게 합니다.",
      "노출 선호도가 낮으면 브이넥 깊이를 줄이고 소재감으로 포인트를 줍니다.",
      "향후 룩북 생성에서는 과한 주얼리보다 작은 광택이 안정적입니다.",
    ],
    tags: ["date", "romantic", "soft", "warm"],
    trendScore: 73,
    freshnessScore: 69,
  },
  {
    slug: "formal-ceremony-line",
    genre: "formal",
    headline: "세리머니 포멀 라인",
    summary: "행사와 중요한 자리에 맞게 절제된 색과 긴 선으로 헤어를 격식 있게 받쳐줍니다.",
    palette: ["블랙", "펄", "스모크", "실버"],
    silhouette: "긴 세로선과 깨끗한 넥라인을 중심으로 한 드레스업 실루엣",
    items: [
      item("outer", "롱 포멀 블레이저", "전체를 길게 정리하면서 헤어 주변을 깨끗하게 둡니다.", "블랙", "테일러드", "울"),
      item("top", "펄 새틴 톱", "격식 있는 광택을 더하되 장식은 절제합니다.", "펄", "레귤러", "새틴"),
      item("bottom", "풀렝스 테일러드 팬츠", "하체 라인을 길고 단정하게 만듭니다.", "스모크", "스트레이트", "울 블렌드"),
      item("shoes", "샤프 드레스 슈즈", "행사용 무드를 안정적으로 완성합니다.", "블랙", "스탠더드", "레더"),
      item("accessory", "미니멀 실버 주얼리", "작은 광택으로 포멀함만 더합니다.", "실버", "스몰", "메탈"),
    ],
    stylingNotes: [
      "행사 룩은 헤어가 묻히지 않도록 상체 장식을 한 가지 이하로 제한합니다.",
      "사진에서 몸이 무거워 보이면 재킷을 열어 세로선을 확보합니다.",
      "흰 셔츠가 강하게 뜨면 펄이나 아이보리 톤으로 부드럽게 낮춥니다.",
    ],
    tags: ["formal", "ceremony", "tailored", "elegant"],
    trendScore: 68,
    freshnessScore: 61,
  },
  {
    slug: "athleisure-active-clean",
    genre: "athleisure",
    headline: "액티브 클린 애슬레저",
    summary: "편안한 움직임과 깔끔한 인상을 함께 가져가며 헤어를 가리지 않는 스포티 룩입니다.",
    palette: ["스톤", "블랙", "라이트 그레이", "라임 포인트"],
    silhouette: "짧은 아우터와 조거 팬츠로 활동성을 살린 스포티 실루엣",
    items: [
      item("outer", "라이트 집업 재킷", "목선이 높지 않은 집업으로 헤어를 가리지 않고 활동성을 줍니다.", "스톤", "레귤러", "나일론"),
      item("top", "드라이 터치 티셔츠", "가볍고 구김이 적어 전신 룩북에서 깨끗하게 보입니다.", "라이트 그레이", "레귤러", "테크 저지"),
      item("bottom", "테이퍼드 조거 팬츠", "편안하지만 발목으로 갈수록 정리되는 라인입니다.", "블랙", "테이퍼드", "스트레치 나일론"),
      item("shoes", "클린 트레이닝 슈즈", "스포티하지만 과하게 튀지 않는 슈즈입니다.", "화이트", "스탠더드", "메시"),
      item("accessory", "슬림 웨이스트백", "손을 자유롭게 두면서 룩에 기능성을 더합니다.", "블랙", "스몰", "나일론"),
    ],
    stylingNotes: [
      "후드가 큰 아이템은 헤어를 가릴 수 있어 낮은 칼라의 집업을 우선합니다.",
      "운동복처럼 보이지 않게 색은 두세 가지 안에서 제한합니다.",
      "헤어가 부드러운 스타일이면 신발과 가방만 선명하게 잡아 균형을 만듭니다.",
    ],
    tags: ["athleisure", "sporty", "active", "jogger"],
    trendScore: 69,
    freshnessScore: 65,
  },
];

export function buildSeedFashionCatalogRows(
  cycleId: string,
  nowIso: string,
  sourceSummary: FashionCatalogSourceSummary = buildSeedFashionSourceSummary(new Date(nowIso)),
): FashionCatalogRow[] {
  return SEED_FASHION_CATALOG.map((entry) => ({
    ...entry,
    id: entry.slug,
    market: "kr",
    status: "active",
    sourceCycleId: cycleId,
    sourceSummary,
    createdAt: nowIso,
    updatedAt: nowIso,
  }));
}
