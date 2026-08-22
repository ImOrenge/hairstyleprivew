import type { MakeupModule } from "./contract.ts";

const TECHNICAL_LABELS: Record<string, string> = {
  face_oval: "얼굴 전체",
  left_cheek: "왼쪽 볼",
  right_cheek: "오른쪽 볼",
  left_eye: "왼쪽 눈",
  right_eye: "오른쪽 눈",
  inner_lip: "입술 안쪽",
  outer_lip: "입술 외곽",
  jaw_shadow: "턱선 음영",
  nose_contour: "코 윤곽",
  nose_bridge: "콧대",
  t_zone: "T존",
  t_zone_highlight: "T존 하이라이트",
  center_to_outer: "중앙에서 바깥쪽",
  inner_to_outer: "안쪽에서 바깥쪽",
  follow_topology: "얼굴 선을 따라",
  follow_source_geometry: "현재 얼굴 선을 따라",
  normalized_source_image: "상담 사진 기준",
  neutral_beige: "뉴트럴 베이지",
  deep_neutral_brown: "딥 뉴트럴 브라운",
  soft_brown: "소프트 브라운",
  brick_rose: "브릭 로즈",
  peach_coral: "피치 코랄",
  soft_camel: "소프트 카멜",
  semi_glow: "은은한 윤광",
  semi_matte: "세미 매트",
  soft_matte: "부드러운 매트",
};

export function makeupTechnicalCustomerLabel(value: string) {
  return (
    TECHNICAL_LABELS[value] ??
    value
      .replace(/[_:+-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

const ROUTINE_INSTRUCTIONS: Record<MakeupModule, string> = {
  base: "얼굴 중앙에서 바깥쪽으로 얇게 펴 바르고 필요한 부위만 한 번 더 덧발라요.",
  brow: "눈썹 앞머리는 옅게 두고 빈 부분을 결 방향으로 짧게 채워요.",
  eyeshadow: "눈을 뜬 상태에서 보이는 범위까지 얇게 펴고 바깥 경계를 부드럽게 풀어요.",
  eyeliner: "눈 중앙부터 꼬리 방향으로 짧게 연결하고 끝선은 여러 번 나눠 조절해요.",
  blush: "볼 중앙보다 바깥 경계부터 옅게 풀고 필요한 만큼만 색을 더해요.",
  lip: "입술 중앙에서 입꼬리 방향으로 얇게 펴고 경계를 정돈해요.",
  lashes: "속눈썹 뿌리부터 짧게 들어 올리고 마르기 전에 뭉침을 나눠요.",
};

export function makeupRoutineInstruction(module: MakeupModule) {
  return ROUTINE_INSTRUCTIONS[module];
}
