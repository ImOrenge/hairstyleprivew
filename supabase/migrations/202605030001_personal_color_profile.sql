-- Store the latest personal color diagnosis on the style profile.

alter table if exists public.user_style_profiles
  add column if not exists personal_color_tone text
    check (personal_color_tone is null or personal_color_tone in ('warm', 'cool', 'neutral')),
  add column if not exists personal_color_contrast text
    check (personal_color_contrast is null or personal_color_contrast in ('low', 'medium', 'high')),
  add column if not exists personal_color_result jsonb,
  add column if not exists personal_color_model text,
  add column if not exists personal_color_diagnosed_at timestamptz;
