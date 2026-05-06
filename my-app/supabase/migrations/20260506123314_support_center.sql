-- HairFit public support center.
-- Public read, authenticated post creation, admin moderation through app routes.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'support_post_kind') then
    create type public.support_post_kind as enum (
      'review',
      'requirement',
      'suggestion',
      'bug'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'support_post_status') then
    create type public.support_post_status as enum (
      'received',
      'reviewing',
      'planned',
      'resolved',
      'on_hold'
    );
  end if;
end
$$;

create table if not exists public.support_posts (
  id uuid primary key default gen_random_uuid(),
  kind public.support_post_kind not null,
  status public.support_post_status not null default 'received',
  title text not null check (char_length(trim(title)) between 4 and 120),
  body text not null check (char_length(trim(body)) between 10 and 5000),
  author_user_id text not null references public.users(id) on delete cascade,
  author_display_name text not null check (char_length(trim(author_display_name)) between 1 and 80),
  admin_answer text check (admin_answer is null or char_length(trim(admin_answer)) between 1 and 5000),
  admin_answered_at timestamptz,
  admin_answered_by text references public.users(id) on delete set null,
  is_hidden boolean not null default false,
  hidden_reason text,
  hidden_at timestamptz,
  hidden_by text references public.users(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_support_posts_public_created_at
  on public.support_posts (is_hidden, deleted_at, created_at desc);

create index if not exists idx_support_posts_kind_status_created_at
  on public.support_posts (kind, status, created_at desc)
  where deleted_at is null;

create index if not exists idx_support_posts_author_created_at
  on public.support_posts (author_user_id, created_at desc);

drop trigger if exists trg_support_posts_set_updated_at on public.support_posts;
create trigger trg_support_posts_set_updated_at
before update on public.support_posts
for each row
execute procedure public.set_updated_at();

create table if not exists public.support_faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null unique check (char_length(trim(question)) between 4 and 160),
  answer text not null check (char_length(trim(answer)) between 10 and 3000),
  category text not null default 'general' check (char_length(trim(category)) between 1 and 80),
  sort_order integer not null default 100,
  is_published boolean not null default true,
  created_by text references public.users(id) on delete set null,
  updated_by text references public.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_support_faqs_public_sort_order
  on public.support_faqs (is_published, sort_order, created_at);

drop trigger if exists trg_support_faqs_set_updated_at on public.support_faqs;
create trigger trg_support_faqs_set_updated_at
before update on public.support_faqs
for each row
execute procedure public.set_updated_at();

alter table public.support_posts enable row level security;
alter table public.support_faqs enable row level security;

drop policy if exists "support_posts_public_select" on public.support_posts;
create policy "support_posts_public_select"
  on public.support_posts
  for select
  to anon, authenticated
  using (deleted_at is null and is_hidden = false);

drop policy if exists "support_posts_insert_own" on public.support_posts;
create policy "support_posts_insert_own"
  on public.support_posts
  for insert
  to authenticated
  with check (author_user_id = auth.jwt() ->> 'sub');

drop policy if exists "support_posts_update_own" on public.support_posts;
create policy "support_posts_update_own"
  on public.support_posts
  for update
  to authenticated
  using (author_user_id = auth.jwt() ->> 'sub' and deleted_at is null)
  with check (author_user_id = auth.jwt() ->> 'sub');

drop policy if exists "support_posts_admin_all" on public.support_posts;
create policy "support_posts_admin_all"
  on public.support_posts
  for all
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

drop policy if exists "support_faqs_public_select" on public.support_faqs;
create policy "support_faqs_public_select"
  on public.support_faqs
  for select
  to anon, authenticated
  using (is_published = true);

drop policy if exists "support_faqs_admin_all" on public.support_faqs;
create policy "support_faqs_admin_all"
  on public.support_faqs
  for all
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

revoke all on table public.support_posts from anon, authenticated;
revoke all on table public.support_faqs from anon, authenticated;
grant usage on type public.support_post_kind to anon, authenticated;
grant usage on type public.support_post_status to anon, authenticated;
grant select on table public.support_posts to anon, authenticated;
grant select on table public.support_faqs to anon, authenticated;
grant insert (kind, title, body, author_user_id, author_display_name) on table public.support_posts to authenticated;
grant update (title, body, deleted_at) on table public.support_posts to authenticated;

insert into public.support_faqs (question, answer, category, sort_order, is_published)
values
  (
    'AI 헤어스타일 미리보기에는 어떤 사진이 가장 좋나요?',
    '얼굴이 정면으로 보이고 머리카락과 얼굴선이 가려지지 않은 밝은 사진이 가장 좋습니다. 과한 필터나 기울어진 사진보다 자연광에 가까운 정면 사진을 권장합니다.',
    'hairfit',
    10,
    true
  ),
  (
    '남자 헤어스타일과 여자 헤어스타일을 모두 추천하나요?',
    '네. 회원 설정과 선택한 스타일 방향에 따라 짧은 머리, 중간 길이, 긴 머리 후보를 포함해 여러 분위기의 헤어스타일을 비교할 수 있습니다.',
    'hairfit',
    20,
    true
  ),
  (
    '추천 결과를 미용실 상담에 사용할 수 있나요?',
    '마음에 드는 결과 이미지를 저장해 미용실 상담 자료로 보여줄 수 있습니다. 길이, 볼륨, 분위기를 말로 설명하는 시간을 줄이는 용도로 적합합니다.',
    'hairfit',
    30,
    true
  ),
  (
    '헤어에 맞춘 패션 코디 추천은 어떻게 이어지나요?',
    '9가지 헤어 후보 중 하나를 선택하면 체형 프로필과 원하는 분위기를 기준으로 선택한 헤어에 어울리는 코디 방향과 룩북 이미지를 확인할 수 있습니다.',
    'hairfit',
    40,
    true
  ),
  (
    '버그나 개선 요청은 어디에 남기면 되나요?',
    '고객지원센터의 버그 제보, 건의사항, 요구사항 게시판에 남겨주세요. 접수된 글은 공개되며 관리자가 상태와 공식 답변을 업데이트합니다.',
    'support',
    50,
    true
  )
on conflict (question) do nothing;
