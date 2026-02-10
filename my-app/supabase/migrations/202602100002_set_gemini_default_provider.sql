-- Switch default image model provider from Replicate to Gemini.
alter table if exists public.generations
  alter column model_provider set default 'gemini';
