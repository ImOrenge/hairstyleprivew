-- HairFit AI seed data (idempotent)
-- Run manually after migrations:
--   supabase db push
--   psql <connection> -f supabase/seed.sql

insert into public.users (id, email, display_name)
values
  ('user_demo_001', 'demo1@hairfit.ai', 'Demo User 1'),
  ('user_demo_002', 'demo2@hairfit.ai', 'Demo User 2'),
  ('user_3DAGJzag8DlkCvNEjWt0fxLhVhy', 'codex-mobile-ui-test+20260502@example.com', 'Codex Admin Test')
on conflict (id) do update
set email = excluded.email,
    display_name = excluded.display_name,
    updated_at = timezone('utc', now());

with demo_generation as (
  insert into public.generations (
    user_id,
    original_image_path,
    generated_image_path,
    prompt_used,
    options,
    status,
    credits_used,
    model_provider,
    model_name
  )
  select
    'user_demo_001',
    'original/demo-user-001.jpg',
    'generated/demo-user-001-layered.jpg',
    'brown layered hair, medium length, female, photorealistic',
    '{"gender":"female","length":"medium","style":"layered","color":"brown"}'::jsonb,
    'completed'::public.generation_status,
    5,
    'gemini',
    'gemini-3-pro-image-preview'
  where not exists (
    select 1
      from public.generations
     where user_id = 'user_demo_001'
       and original_image_path = 'original/demo-user-001.jpg'
       and generated_image_path = 'generated/demo-user-001-layered.jpg'
  )
  returning id
)
select 1
from demo_generation;

insert into public.payment_transactions (
  id,
  user_id,
  provider,
  provider_order_id,
  provider_customer_id,
  status,
  currency,
  amount,
  credits_to_grant,
  metadata,
  paid_at
)
select
  '11111111-1111-1111-1111-111111111111'::uuid,
  'user_demo_001',
  'polar'::public.payment_provider,
  'order_demo_001',
  'customer_demo_001',
  'paid'::public.payment_status,
  'KRW',
  9900,
  100,
  '{"plan":"starter-100"}'::jsonb,
  timezone('utc', now())
where not exists (
  select 1
    from public.payment_transactions
   where id = '11111111-1111-1111-1111-111111111111'::uuid
);

select public.grant_credits(
  'user_demo_001',
  20,
  'grant',
  'seed_welcome_credits',
  '{"seed":true}'::jsonb,
  null
)
where not exists (
  select 1
    from public.credit_ledger
   where user_id = 'user_demo_001'
     and reason = 'seed_welcome_credits'
);

select public.apply_payment_credits('11111111-1111-1111-1111-111111111111'::uuid, 'seed_payment_apply')
where not exists (
  select 1
    from public.credit_ledger
   where payment_transaction_id = '11111111-1111-1111-1111-111111111111'::uuid
     and entry_type = 'purchase'
);

insert into public.user_hair_records (
  id,
  user_id,
  generation_id,
  style_name,
  service_type,
  service_date,
  next_visit_target_days,
  care_generated_at,
  created_at
)
values
  (
    '22222222-2222-4222-8222-222222222221'::uuid,
    'user_3DAGJzag8DlkCvNEjWt0fxLhVhy',
    (
      select id
      from public.generations
      where user_id = 'user_3DAGJzag8DlkCvNEjWt0fxLhVhy'
        and original_image_path = 'original/demo-user-001.jpg'
        and generated_image_path = 'generated/demo-user-001-layered.jpg'
      order by created_at desc
      limit 1
    ),
    '소프트 레이어드 볼륨펌',
    'perm',
    '2026-04-28'::date,
    90,
    timezone('utc', now()),
    '2026-04-28T08:30:00+09:00'::timestamptz
  ),
  (
    '22222222-2222-4222-8222-222222222222'::uuid,
    'user_3DAGJzag8DlkCvNEjWt0fxLhVhy',
    null,
    '애쉬 브라운 톤다운 컬러',
    'color',
    '2026-03-22'::date,
    45,
    timezone('utc', now()),
    '2026-03-22T14:10:00+09:00'::timestamptz
  )
on conflict (id) do update
set user_id = excluded.user_id,
    generation_id = excluded.generation_id,
    style_name = excluded.style_name,
    service_type = excluded.service_type,
    service_date = excluded.service_date,
    next_visit_target_days = excluded.next_visit_target_days,
    care_generated_at = excluded.care_generated_at;

insert into public.user_aftercare_guides (
  id,
  user_id,
  hair_record_id,
  guide_json
)
values
  (
    '33333333-3333-4333-8333-333333333331'::uuid,
    'user_3DAGJzag8DlkCvNEjWt0fxLhVhy',
    '22222222-2222-4222-8222-222222222221'::uuid,
    $guide$
{
  "overview": {
    "styleName": "소프트 레이어드 볼륨펌",
    "serviceType": "perm",
    "headline": "소프트 레이어드 볼륨펌 에프터케어",
    "summary": "시술 직후 1주일은 컬의 탄력과 뿌리 볼륨이 자리 잡는 기간입니다. 과한 열과 무거운 오일을 피하고, 두피에서 모발 끝으로 바람을 정리해 자연스러운 레이어 흐름을 유지하세요.",
    "serviceDate": "2026-04-28"
  },
  "sections": {
    "dry": {
      "title": "볼륨을 살리는 드라이",
      "goal": "뿌리 볼륨과 레이어 방향을 고정해 펌 컬이 납작해지지 않게 합니다.",
      "timing": "샴푸 후 물기가 70% 정도 마른 시점",
      "steps": [
        "수건으로 비비지 말고 눌러서 물기를 제거합니다.",
        "고개를 살짝 숙이고 두피 쪽부터 중간 바람으로 말립니다.",
        "얼굴 주변 레이어는 손가락으로 바깥 방향을 만들며 식혀 고정합니다.",
        "끝부분은 찬바람으로 마무리해 부스스함을 줄입니다."
      ],
      "products": [
        "열 보호 미스트",
        "가벼운 컬 크림",
        "볼륨 브러시"
      ],
      "avoid": [
        "젖은 상태로 묶기",
        "강한 뜨거운 바람을 한곳에 오래 대기",
        "무거운 오일을 뿌리 가까이에 바르기"
      ]
    },
    "treatment": {
      "title": "탄력 유지 트리트먼트",
      "goal": "펌 후 건조해진 중간과 끝부분에 수분을 보충합니다.",
      "timing": "주 2회, 샴푸 후",
      "steps": [
        "트리트먼트를 모발 중간부터 끝까지 바릅니다.",
        "굵은 빗으로 엉킨 부분만 부드럽게 정리합니다.",
        "3분 뒤 미지근한 물로 충분히 헹굽니다.",
        "컬 크림은 손바닥에 얇게 펴서 끝부분에만 바릅니다."
      ],
      "products": [
        "수분 트리트먼트",
        "리브인 에센스",
        "컬 전용 크림"
      ],
      "avoid": [
        "매일 무거운 헤어팩 사용",
        "두피에 트리트먼트 과다 도포",
        "뜨거운 물로 오래 헹구기"
      ]
    },
    "iron": {
      "title": "저온 고데기 보정",
      "goal": "펌 컬을 손상시키지 않고 앞머리와 끝 방향만 정리합니다.",
      "timing": "모발이 완전히 마른 뒤",
      "steps": [
        "열 보호제를 먼저 뿌리고 1분 정도 흡수시킵니다.",
        "온도는 150도 안팎에서 시작합니다.",
        "한 구간을 3초 이상 오래 누르지 않습니다.",
        "얼굴 주변은 바깥 방향으로 한 번만 통과시킵니다."
      ],
      "products": [
        "열 보호제",
        "집게핀",
        "마무리 세럼"
      ],
      "avoid": [
        "젖은 모발에 고데기 사용",
        "같은 구간 반복 집기",
        "강한 고정 스프레이 후 열 사용"
      ]
    },
    "styling": {
      "title": "아침 스타일링 루틴",
      "goal": "컬을 다시 살리면서 하루 동안 자연스러운 볼륨을 유지합니다.",
      "timing": "외출 전 5분",
      "steps": [
        "물 스프레이로 눌린 부분만 가볍게 적십니다.",
        "손으로 컬 방향을 잡고 약한 바람으로 말립니다.",
        "컬 크림을 콩알만큼 덜어 끝부분에 주무르듯 바릅니다.",
        "정수리 볼륨은 손가락으로 들어 올린 뒤 찬바람으로 고정합니다."
      ],
      "products": [
        "물 스프레이",
        "컬 크림",
        "라이트 홀드 스프레이"
      ],
      "avoid": [
        "빗으로 컬 전체를 강하게 빗기",
        "제품을 한 번에 많이 바르기",
        "모발 끝을 계속 만지기"
      ]
    }
  },
  "maintenanceSchedule": [
    {
      "dayOffset": 1,
      "label": "D+1",
      "description": "샴푸는 가능하면 늦추고 드라이 방향만 가볍게 정리하세요."
    },
    {
      "dayOffset": 3,
      "label": "D+3",
      "description": "수분 트리트먼트를 시작하고 컬 크림 사용량을 조절하세요."
    },
    {
      "dayOffset": 7,
      "label": "D+7",
      "description": "눌리는 구간과 부스스한 끝부분을 확인해 스타일링 루틴을 고정하세요."
    },
    {
      "dayOffset": 30,
      "label": "D+30",
      "description": "뿌리 볼륨과 레이어 흐름을 점검하고 앞머리 보정 컷을 검토하세요."
    },
    {
      "dayOffset": 90,
      "label": "D+90",
      "description": "펌 탄력이 줄어드는 시점이므로 다음 스타일 상담을 예약하세요."
    }
  ],
  "warnings": [
    "두피 따가움이나 붉어짐이 지속되면 열기구 사용을 중단하고 전문가에게 상담하세요.",
    "펌 직후 1주일은 탈색이나 강한 염색 시술을 피하세요.",
    "컬이 풀린다고 같은 부위를 반복해서 고데기로 누르지 마세요."
  ],
  "recommendedNextActions": [
    "오늘 드라이 후 정면과 측면 사진을 남겨 컬 방향을 기록하세요.",
    "일주일 뒤 끝부분 건조함을 확인하고 트리트먼트 빈도를 조정하세요.",
    "한 달 뒤 뿌리 볼륨이 줄면 살롱에 보정 상담을 요청하세요."
  ]
}
$guide$::jsonb
  ),
  (
    '33333333-3333-4333-8333-333333333332'::uuid,
    'user_3DAGJzag8DlkCvNEjWt0fxLhVhy',
    '22222222-2222-4222-8222-222222222222'::uuid,
    $guide$
{
  "overview": {
    "styleName": "애쉬 브라운 톤다운 컬러",
    "serviceType": "color",
    "headline": "애쉬 브라운 톤다운 컬러 에프터케어",
    "summary": "톤다운 컬러는 첫 2주 동안 색 빠짐과 노란 기를 어떻게 관리하느냐가 중요합니다. 미지근한 물, 컬러 전용 샴푸, 낮은 열 스타일링으로 차분한 애쉬 브라운 톤을 오래 유지하세요.",
    "serviceDate": "2026-03-22"
  },
  "sections": {
    "dry": {
      "title": "컬러 보호 드라이",
      "goal": "염색 후 큐티클을 거칠게 만들지 않고 윤기와 색감을 지킵니다.",
      "timing": "샴푸 후 바로",
      "steps": [
        "수건으로 감싸 눌러 물기를 제거합니다.",
        "두피부터 빠르게 말려 습한 시간을 줄입니다.",
        "중간과 끝부분은 낮은 온도 바람으로 방향만 정리합니다.",
        "마지막에는 찬바람으로 표면을 정돈합니다."
      ],
      "products": [
        "컬러 보호 미스트",
        "극세사 타월",
        "저자극 브러시"
      ],
      "avoid": [
        "젖은 모발을 세게 비비기",
        "고온 바람을 끝부분에 오래 대기",
        "물기가 남은 상태로 잠들기"
      ]
    },
    "treatment": {
      "title": "색 빠짐 완화 케어",
      "goal": "모발 표면을 부드럽게 유지해 컬러 퇴색을 늦춥니다.",
      "timing": "주 2~3회",
      "steps": [
        "컬러 전용 샴푸를 두피 중심으로 사용합니다.",
        "트리트먼트는 중간부터 끝까지 바르고 3분 유지합니다.",
        "헹굼은 미지근한 물로 짧게 마무리합니다.",
        "외출 전에는 자외선 차단 기능이 있는 미스트를 뿌립니다."
      ],
      "products": [
        "컬러 전용 샴푸",
        "약산성 트리트먼트",
        "UV 보호 미스트"
      ],
      "avoid": [
        "딥 클렌징 샴푸 잦은 사용",
        "뜨거운 물 샴푸",
        "수영장 물에 장시간 노출"
      ]
    },
    "iron": {
      "title": "컬러 손상 줄이는 열기구",
      "goal": "애쉬 톤이 탁해지지 않도록 열 손상을 최소화합니다.",
      "timing": "완전히 말린 뒤 필요한 구간만",
      "steps": [
        "열 보호제를 모발 전체에 얇게 분사합니다.",
        "온도는 140~160도 범위에서 사용합니다.",
        "끝부분만 빠르게 통과시켜 윤기를 정리합니다.",
        "마무리 세럼은 손바닥에 펴서 표면에만 살짝 바릅니다."
      ],
      "products": [
        "열 보호 스프레이",
        "세라믹 아이론",
        "가벼운 윤기 세럼"
      ],
      "avoid": [
        "고온으로 매일 전체 스타일링",
        "한 구간을 여러 번 누르기",
        "오일을 바른 직후 고데기 사용"
      ]
    },
    "styling": {
      "title": "차분한 톤다운 스타일링",
      "goal": "부스스함을 줄이고 브라운 톤의 윤기를 살립니다.",
      "timing": "외출 전",
      "steps": [
        "엉킨 부분만 넓은 빗으로 정리합니다.",
        "표면 잔머리는 소량의 세럼으로 눌러줍니다.",
        "끝부분은 브러시로 안쪽 방향을 만들며 말립니다.",
        "강한 고정보다는 가벼운 스프레이로 윤곽만 잡습니다."
      ],
      "products": [
        "와이드 콤",
        "라이트 세럼",
        "소프트 스프레이"
      ],
      "avoid": [
        "매트한 왁스 과다 사용",
        "알코올감이 강한 스프레이 반복 사용",
        "햇빛에 장시간 모발 노출"
      ]
    }
  },
  "maintenanceSchedule": [
    {
      "dayOffset": 1,
      "label": "D+1",
      "description": "첫 샴푸는 컬러 전용 제품으로 짧게 진행하고 뜨거운 물은 피하세요."
    },
    {
      "dayOffset": 3,
      "label": "D+3",
      "description": "퇴색이 빠른 끝부분에 약산성 트리트먼트를 집중하세요."
    },
    {
      "dayOffset": 7,
      "label": "D+7",
      "description": "노란 기가 올라오는지 확인하고 필요하면 보색 샴푸 빈도를 상담하세요."
    },
    {
      "dayOffset": 30,
      "label": "D+30",
      "description": "뿌리 자람과 전체 톤 균일도를 확인해 리터치 일정을 잡으세요."
    },
    {
      "dayOffset": 45,
      "label": "D+45",
      "description": "애쉬 톤 유지가 어려워지는 시점이므로 톤 보정 상담을 권장합니다."
    }
  ],
  "warnings": [
    "두피 가려움이나 따가움이 심하면 염색 전용 제품도 잠시 중단하세요.",
    "보색 샴푸를 매일 사용하면 톤이 탁해질 수 있습니다.",
    "염색 직후 탈색이나 펌을 겹치면 손상 위험이 커집니다."
  ],
  "recommendedNextActions": [
    "오늘 자연광에서 색감을 촬영해 퇴색 기준 사진을 남기세요.",
    "일주일 뒤 노란 기와 끝부분 건조함을 체크하세요.",
    "45일 전후로 톤 보정 또는 리터치 상담을 예약하세요."
  ]
}
$guide$::jsonb
  )
on conflict (hair_record_id) do update
set id = excluded.id,
    user_id = excluded.user_id,
    guide_json = excluded.guide_json,
    updated_at = timezone('utc', now());

insert into public.user_care_contents (
  id,
  user_id,
  hair_record_id,
  content_type,
  day_offset,
  subject,
  body_html,
  scheduled_send_at
)
values
  (
    '44444444-4444-4444-8444-444444444401'::uuid,
    'user_3DAGJzag8DlkCvNEjWt0fxLhVhy',
    '22222222-2222-4222-8222-222222222221'::uuid,
    'dry_guide',
    1,
    '[HariStyle] 볼륨펌 D+1 드라이 체크',
    $html$<div style="max-width:600px;margin:0 auto;font-family:-apple-system,Arial,sans-serif;color:#111827;line-height:1.7"><h2>소프트 레이어드 볼륨펌 D+1</h2><p>오늘은 컬이 자리 잡는 날입니다. 샴푸는 늦추고 두피부터 중간 바람으로 말려 뿌리 볼륨을 살려주세요.</p><ul><li>젖은 상태로 묶지 않기</li><li>얼굴 주변 레이어는 바깥 방향으로 식혀 고정하기</li><li><a href="{{CTA_URL}}">에프터케어 가이드 보기</a></li></ul></div>$html$,
    '2026-04-29T10:00:00+09:00'::timestamptz
  ),
  (
    '44444444-4444-4444-8444-444444444402'::uuid,
    'user_3DAGJzag8DlkCvNEjWt0fxLhVhy',
    '22222222-2222-4222-8222-222222222221'::uuid,
    'day3_care',
    3,
    '[HariStyle] 볼륨펌 D+3 수분 케어',
    $html$<div style="max-width:600px;margin:0 auto;font-family:-apple-system,Arial,sans-serif;color:#111827;line-height:1.7"><h2>소프트 레이어드 볼륨펌 D+3</h2><p>수분 트리트먼트를 시작해도 좋은 시점입니다. 모발 중간부터 끝까지 바르고 뿌리에는 무겁게 바르지 마세요.</p><ul><li>주 2회 트리트먼트</li><li>컬 크림은 끝부분에 소량만</li><li><a href="{{CTA_URL}}">전체 루틴 확인</a></li></ul></div>$html$,
    '2026-05-01T10:00:00+09:00'::timestamptz
  ),
  (
    '44444444-4444-4444-8444-444444444403'::uuid,
    'user_3DAGJzag8DlkCvNEjWt0fxLhVhy',
    '22222222-2222-4222-8222-222222222221'::uuid,
    'week1_tip',
    7,
    '[HariStyle] 볼륨펌 1주차 스타일링 팁',
    $html$<div style="max-width:600px;margin:0 auto;font-family:-apple-system,Arial,sans-serif;color:#111827;line-height:1.7"><h2>소프트 레이어드 볼륨펌 1주차</h2><p>눌리는 구간과 부스스한 끝부분을 확인해 아침 루틴을 고정하세요. 물 스프레이와 약한 바람만으로 컬을 다시 살릴 수 있습니다.</p><ul><li>고데기는 필요한 구간만 저온 사용</li><li>빗질은 끝 엉킴만 정리</li><li><a href="{{CTA_URL}}">스타일링 단계 보기</a></li></ul></div>$html$,
    '2026-05-05T10:00:00+09:00'::timestamptz
  ),
  (
    '44444444-4444-4444-8444-444444444404'::uuid,
    'user_3DAGJzag8DlkCvNEjWt0fxLhVhy',
    '22222222-2222-4222-8222-222222222221'::uuid,
    'month1_revisit',
    30,
    '[HariStyle] 볼륨펌 30일차 점검',
    $html$<div style="max-width:600px;margin:0 auto;font-family:-apple-system,Arial,sans-serif;color:#111827;line-height:1.7"><h2>소프트 레이어드 볼륨펌 30일차</h2><p>뿌리 볼륨과 얼굴 주변 레이어 흐름을 점검하세요. 앞머리나 끝부분이 무거워졌다면 보정 컷 상담을 권장합니다.</p><ul><li>정면과 측면 사진 비교</li><li>컬 탄력과 끝 건조함 확인</li><li><a href="{{CTA_URL}}">재방문 기준 보기</a></li></ul></div>$html$,
    '2026-05-28T10:00:00+09:00'::timestamptz
  ),
  (
    '44444444-4444-4444-8444-444444444405'::uuid,
    'user_3DAGJzag8DlkCvNEjWt0fxLhVhy',
    '22222222-2222-4222-8222-222222222221'::uuid,
    'month1_trend',
    45,
    '[HariStyle] 볼륨펌 45일차 스타일 제안',
    $html$<div style="max-width:600px;margin:0 auto;font-family:-apple-system,Arial,sans-serif;color:#111827;line-height:1.7"><h2>소프트 레이어드 볼륨펌 45일차</h2><p>컬이 자연스럽게 풀리는 시점에는 레이어 결을 살린 내추럴 웨이브 스타일이 잘 어울립니다.</p><ul><li>무거운 오일보다는 가벼운 세럼</li><li>정수리 볼륨 보정</li><li><a href="{{CTA_URL}}">다음 스타일 방향 보기</a></li></ul></div>$html$,
    '2026-06-12T10:00:00+09:00'::timestamptz
  ),
  (
    '44444444-4444-4444-8444-444444444406'::uuid,
    'user_3DAGJzag8DlkCvNEjWt0fxLhVhy',
    '22222222-2222-4222-8222-222222222221'::uuid,
    'month3_cta',
    90,
    '[HariStyle] 볼륨펌 90일차 재상담 알림',
    $html$<div style="max-width:600px;margin:0 auto;font-family:-apple-system,Arial,sans-serif;color:#111827;line-height:1.7"><h2>소프트 레이어드 볼륨펌 90일차</h2><p>펌 탄력이 줄어드는 시점입니다. 현재 길이와 볼륨 변화를 기준으로 다음 스타일을 상담해보세요.</p><ul><li>컬 유지 상태 확인</li><li>뿌리 볼륨 재시술 여부 상담</li><li><a href="{{CTA_URL}}">에프터케어 기록 열기</a></li></ul></div>$html$,
    '2026-07-27T10:00:00+09:00'::timestamptz
  ),
  (
    '44444444-4444-4444-8444-444444444411'::uuid,
    'user_3DAGJzag8DlkCvNEjWt0fxLhVhy',
    '22222222-2222-4222-8222-222222222222'::uuid,
    'dry_guide',
    1,
    '[HariStyle] 애쉬 브라운 D+1 컬러 보호',
    $html$<div style="max-width:600px;margin:0 auto;font-family:-apple-system,Arial,sans-serif;color:#111827;line-height:1.7"><h2>애쉬 브라운 톤다운 컬러 D+1</h2><p>첫 샴푸는 미지근한 물과 컬러 전용 제품으로 짧게 진행하세요. 드라이는 낮은 온도 바람으로 빠르게 마무리합니다.</p><ul><li>뜨거운 물 피하기</li><li>젖은 모발 세게 비비지 않기</li><li><a href="{{CTA_URL}}">컬러 케어 가이드 보기</a></li></ul></div>$html$,
    '2026-03-23T10:00:00+09:00'::timestamptz
  ),
  (
    '44444444-4444-4444-8444-444444444412'::uuid,
    'user_3DAGJzag8DlkCvNEjWt0fxLhVhy',
    '22222222-2222-4222-8222-222222222222'::uuid,
    'day3_care',
    3,
    '[HariStyle] 애쉬 브라운 D+3 트리트먼트',
    $html$<div style="max-width:600px;margin:0 auto;font-family:-apple-system,Arial,sans-serif;color:#111827;line-height:1.7"><h2>애쉬 브라운 톤다운 컬러 D+3</h2><p>끝부분 퇴색을 늦추기 위해 약산성 트리트먼트를 시작하세요. 헹굼은 짧게, 물 온도는 낮게 유지합니다.</p><ul><li>딥 클렌징 샴푸 피하기</li><li>UV 보호 미스트 사용</li><li><a href="{{CTA_URL}}">관리 루틴 확인</a></li></ul></div>$html$,
    '2026-03-25T10:00:00+09:00'::timestamptz
  ),
  (
    '44444444-4444-4444-8444-444444444413'::uuid,
    'user_3DAGJzag8DlkCvNEjWt0fxLhVhy',
    '22222222-2222-4222-8222-222222222222'::uuid,
    'week1_tip',
    7,
    '[HariStyle] 애쉬 브라운 1주차 톤 체크',
    $html$<div style="max-width:600px;margin:0 auto;font-family:-apple-system,Arial,sans-serif;color:#111827;line-height:1.7"><h2>애쉬 브라운 톤다운 컬러 1주차</h2><p>자연광에서 노란 기가 올라오는지 확인하세요. 보색 샴푸는 매일보다 필요한 날에만 사용하는 편이 안전합니다.</p><ul><li>자연광 사진 비교</li><li>고온 고데기 줄이기</li><li><a href="{{CTA_URL}}">주의사항 보기</a></li></ul></div>$html$,
    '2026-03-29T10:00:00+09:00'::timestamptz
  ),
  (
    '44444444-4444-4444-8444-444444444414'::uuid,
    'user_3DAGJzag8DlkCvNEjWt0fxLhVhy',
    '22222222-2222-4222-8222-222222222222'::uuid,
    'month1_revisit',
    30,
    '[HariStyle] 애쉬 브라운 30일차 리터치 체크',
    $html$<div style="max-width:600px;margin:0 auto;font-family:-apple-system,Arial,sans-serif;color:#111827;line-height:1.7"><h2>애쉬 브라운 톤다운 컬러 30일차</h2><p>뿌리 자람과 전체 톤 균일도를 확인하세요. 톤이 밝아졌다면 리터치 상담을 잡는 것이 좋습니다.</p><ul><li>뿌리 경계 확인</li><li>끝부분 건조함 점검</li><li><a href="{{CTA_URL}}">재방문 기준 보기</a></li></ul></div>$html$,
    '2026-04-21T10:00:00+09:00'::timestamptz
  ),
  (
    '44444444-4444-4444-8444-444444444415'::uuid,
    'user_3DAGJzag8DlkCvNEjWt0fxLhVhy',
    '22222222-2222-4222-8222-222222222222'::uuid,
    'month1_trend',
    45,
    '[HariStyle] 애쉬 브라운 45일차 톤 보정 제안',
    $html$<div style="max-width:600px;margin:0 auto;font-family:-apple-system,Arial,sans-serif;color:#111827;line-height:1.7"><h2>애쉬 브라운 톤다운 컬러 45일차</h2><p>애쉬 톤이 빠지기 쉬운 시점입니다. 차분한 브라운을 유지하려면 톤 보정 상담을 추천합니다.</p><ul><li>보색 샴푸 빈도 조절</li><li>UV 노출 줄이기</li><li><a href="{{CTA_URL}}">다음 컬러 방향 보기</a></li></ul></div>$html$,
    '2026-05-06T10:00:00+09:00'::timestamptz
  ),
  (
    '44444444-4444-4444-8444-444444444416'::uuid,
    'user_3DAGJzag8DlkCvNEjWt0fxLhVhy',
    '22222222-2222-4222-8222-222222222222'::uuid,
    'month3_cta',
    90,
    '[HariStyle] 애쉬 브라운 90일차 새 컬러 상담',
    $html$<div style="max-width:600px;margin:0 auto;font-family:-apple-system,Arial,sans-serif;color:#111827;line-height:1.7"><h2>애쉬 브라운 톤다운 컬러 90일차</h2><p>전체 톤이 많이 변했다면 다음 시즌 컬러를 설계하기 좋은 시점입니다. 현재 사진과 선호 톤을 함께 준비하세요.</p><ul><li>현재 톤 사진 준비</li><li>원하는 밝기 정리</li><li><a href="{{CTA_URL}}">에프터케어 기록 열기</a></li></ul></div>$html$,
    '2026-06-20T10:00:00+09:00'::timestamptz
  )
on conflict (id) do update
set user_id = excluded.user_id,
    hair_record_id = excluded.hair_record_id,
    content_type = excluded.content_type,
    day_offset = excluded.day_offset,
    subject = excluded.subject,
    body_html = excluded.body_html,
    scheduled_send_at = excluded.scheduled_send_at,
    sent_at = null,
    email_message_id = null;
