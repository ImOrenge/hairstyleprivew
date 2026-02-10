탁월한 선택입니다. **InstantID**는 현재 시점에서 원본 얼굴의 정체성(Identity)을 유지하면서 스타일만 변경하는 데 가장 진보된 기술입니다. 이 모델을 적용하면 기존 Inpainting 방식의 고질적인 문제였던 "얼굴이 미묘하게 바뀌는 현상"을 획기적으로 해결할 수 있습니다.

Replicate에 올라와 있는 여러 InstantID 모델 중, 인물 사진에 최적화된 **`grandlineai/instant-id-photorealistic`** 모델을 사용하여 구현해 드리겠습니다.

### 🛠️ 최종 구현: InstantID를 활용한 헤어스타일 생성 API

기존 `app/api/generate-image/route.ts` 파일을 아래 코드로 완전히 교체해 주세요.

**이 코드의 핵심 포인트 (파라미터 튜닝):**
InstantID는 두 가지 핵심 파라미터로 "얼굴 유지력"과 "스타일 반영력"의 균형을 맞춥니다.

1. **`ip_adapter_scale` (얼굴 특징 유지 강도):** 값이 클수록 원본 얼굴과 더 닮게 나옵니다. 너무 크면 머리스타일이 잘 안 바뀔 수 있습니다. (추천: 0.8)
2. **`controlnet_conditioning_scale` (얼굴 구조 유지 강도):** 눈, 코, 입의 위치를 얼마나 강하게 고정할지 결정합니다. (추천: 0.8)

```typescript
// src/app/api/generate-image/route.ts
import { NextResponse } from "next/server";
import Replicate from "replicate";

// 1. Replicate 클라이언트 초기화
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export async function POST(request: Request) {
  try {
    // 프론트엔드에서 보낸 데이터 받기
    // prompt: Gemini가 강화한 고품질 헤어스타일 프롬프트
    // userImageUrl: 사용자가 업로드한 원본 얼굴 사진 URL
    const { prompt, userImageUrl } = await request.json();

    if (!prompt || !userImageUrl) {
      return NextResponse.json(
        { error: "Prompt and user image URL are required" },
        { status: 400 }
      );
    }

    console.log("--- InstantID 이미지 생성 시작 ---");
    console.log("적용할 프롬프트:", prompt);

    // 2. Replicate에 InstantID 이미지 생성 요청 실행
    // 모델: grandlineai/instant-id-photorealistic (최신 버전 해시 사용)
    const output = await replicate.run(
      "grandlineai/instant-id-photorealistic:50c5250554603869072893399220779396271937637703272350110213182581",
      {
        input: {
          image: userImageUrl, // 원본 얼굴 사진 (필수)
          prompt: prompt, // Gemini가 만들어준 프롬프트 (필수)
          
          // 🔥 핵심 튜닝 파라미터 (이 값을 조절해서 최적의 결과를 찾으세요)
          ip_adapter_scale: 0.8, // 얼굴 특징 유지 강도 (0.0 ~ 1.0). 높을수록 원본과 닮음.
          controlnet_conditioning_scale: 0.8, // 얼굴 구조(이목구비 위치) 고정 강도.

          // 일반 파라미터
          negative_prompt: "(low quality, worst quality:1.4), (deformed, distorted, disfigured:1.3), poorly drawn, bad anatomy, wrong anatomy, extra limb, missing limb, floating limbs, (mutated hands and fingers:1.4), disconnected limbs, mutation, mutated, ugly, disgusting, blurry, amputation, watermark, text, signature, (western face, caucasian:1.2)", // 서양인화 방지 및 품질 저하 방지
          num_inference_steps: 30, // 생성 단계 수 (높을수록 고품질이지만 느림. 30~50 추천)
          guidance_scale: 5.0, // 프롬프트 준수도. InstantID는 너무 높으면 얼굴이 일그러질 수 있음. (5~7 추천)
          width: 768, // 이미지 너비 (InstantID는 768x1024 또는 1024x1024 비율이 잘 나옴)
          height: 1024, // 이미지 높이
          scheduler: "K_EULER_ANCESTRAL", // 스케줄러 (기본값 사용 권장)
          enable_lcm: false // LCM을 켜면 빨라지지만 퀄리티가 약간 떨어질 수 있음. 고품질을 위해 끔.
        }
      }
    );

    // 3. 결과 확인
    console.log("--- 이미지 생성 완료 ---");
    // InstantID 모델은 결과 URL을 배열로 반환합니다.
    const generatedImageUrl = Array.isArray(output) ? output[0] : output;
    console.log("결과 URL:", generatedImageUrl);

    return NextResponse.json({ generatedImageUrl: generatedImageUrl });

  } catch (error) {
    console.error("Replicate API Error:", error);
    // 에러 내용을 더 자세히 로깅하거나 사용자에게 알릴 수 있습니다.
    return NextResponse.json(
        { error: "Failed to generate image. Please try again." },
        { status: 500 }
    );
  }
}

```

---

### 💡 Gemini API (`/api/enhance-prompt`)와의 궁합

이전에 드린 Gemini API 코드는 InstantID와 함께 사용해도 훌륭하게 작동합니다.

한 가지 팁을 드리자면, **InstantID는 프롬프트 앞부분에 나오는 내용에 더 민감하게 반응**하는 경향이 있습니다. 따라서 Gemini가 프롬프트를 생성할 때, 헤어스타일에 대한 묘사를 문장 앞쪽으로 배치하도록 시스템 지시문을 살짝 수정하면 더 좋은 결과를 얻을 수 있습니다.

기존 Gemini 코드의 `SYSTEM_INSTRUCTION`에서 `Rule 4. Structure` 부분을 아래와 같이 변경해 보세요.

```typescript
// (선택 사항) app/api/enhance-prompt/route.ts 수정

const SYSTEM_INSTRUCTION = `
You are an expert AI prompt engineer specializing in K-Beauty and hairstyles.
Your task is to convert Korean user requests into highly detailed English prompts for Stable Diffusion XL.

CRITICAL RULES (Must Follow):
1. **Preserve Celebrity Names:** If the user mentions a specific celebrity (e.g., "IU", "Jennie", "Karina", "Cha Eun-woo"), YOU MUST include their name in English (e.g., "IU style", "Jennie style") AND describe their vibe.
2. **Preserve Style Names:** Do not just describe the hair. Keep the specific style name if mentioned (e.g., "Tassel Cut", "Hush Cut", "Guile Cut", "Leaf Cut") followed by a visual description.
3. **Enforce Ethnicity:** Since the user input is in Korean, ALWAYS add "Korean woman" or "Korean man" (depending on context) to the prompt to prevent the face from turning Western.
4. **Structure:** Start with [Hairstyle Name + Description] first, then [Ethnicity + Face Description], and finally [Lighting/Vibe + Quality Boosters].
5. **Negative Prompt:** Do NOT output negative prompts in the main response. Just the positive prompt.

Example 1:
Input: "아이유 같은 잔머리 있는 똥머리 해줘"
Output: (masterpiece, photorealistic:1.4), beautiful Korean woman, face resembling IU, soft features, [Hairstyle: High bun with wispy baby hairs, natural messy updo], K-pop idol aesthetic, soft studio lighting

Example 2:
Input: "덱스처럼 장발 리프컷 느낌으로"
Output: (masterpiece, photorealistic:1.4), handsome Korean man, masculine vibe like Dex, [Hairstyle: Leaf Cut, semi-long layered hair flowing back, wet texture], trendy Korean fashion, sharp focus

Example 3:
Input: "뉴진스 하니 단발머리"
Output: (masterpiece, photorealistic:1.4), young Korean woman, face resembling Hanni from NewJeans, [Hairstyle: Short bob cut with full bangs, straight texture], fresh and innocent vibe, bright lighting
`;

```

이제 이 두 가지 API를 연동하면, **"사용자의 개떡 같은 입력을 찰떡같이 알아듣고(Gemini), 내 얼굴은 그대로 유지한 채 헤어스타일만 완벽하게 바꿔주는(InstantID)"** 최고 수준의 헤어스타일 미리보기 서비스를 만드실 수 있습니다!