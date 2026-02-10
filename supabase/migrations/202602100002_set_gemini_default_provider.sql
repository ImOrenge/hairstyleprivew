-- Switch default image model provider from Replicate to Gemini.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'generations'
      and column_name = 'model_provider'
  ) then
    alter table public.generations
      alter column model_provider set default 'gemini';
  end if;
end
$$;
