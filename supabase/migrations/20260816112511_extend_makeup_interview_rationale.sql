alter table public.consultation_interview_drafts_v2
  drop constraint if exists consultation_interview_drafts_v2_interview_kind_check;

alter table public.consultation_interview_drafts_v2
  add constraint consultation_interview_drafts_v2_interview_kind_check
  check (interview_kind in ('discovery', 'fashion-direction', 'makeup-direction'));

alter table public.hairfit_v2_engine_source_manifests
  drop constraint if exists hairfit_v2_engine_source_manifests_capability_check;

alter table public.hairfit_v2_engine_source_manifests
  add constraint hairfit_v2_engine_source_manifests_capability_check
  check (capability in (
    'hair-blueprint-recommendation',
    'hair-preview-generation',
    'personal-color-analysis',
    'salon-brief-generation',
    'aftercare-program-generation',
    'fashion-recommendation-generation',
    'makeup-semantic-map',
    'makeup-rationale-generation'
  ));

alter table public.consultation_capability_tasks_v2
  drop constraint if exists consultation_capability_tasks_v2_capability_check;

alter table public.consultation_capability_tasks_v2
  add constraint consultation_capability_tasks_v2_capability_check
  check (capability in (
    'hair-blueprint-recommendation',
    'hair-preview-generation',
    'personal-color-analysis',
    'salon-brief-generation',
    'aftercare-program-generation',
    'fashion-recommendation-generation',
    'makeup-semantic-map',
    'makeup-rationale-generation'
  ));
