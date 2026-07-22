-- Supabase auth helpers are stable for the duration of a statement. Wrapping
-- them in scalar subqueries lets Postgres evaluate each helper once as an
-- init-plan instead of once per candidate row. The policy expressions and
-- command/role contracts remain otherwise unchanged.
do $$
declare
  v_policy record;
  v_using text;
  v_check text;
  v_sql text;
begin
  for v_policy in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual, '') like '%auth.uid()%'
        or coalesce(qual, '') like '%auth.jwt()%'
        or coalesce(qual, '') like '%auth.role()%'
        or coalesce(qual, '') like '%auth.email()%'
        or coalesce(with_check, '') like '%auth.uid()%'
        or coalesce(with_check, '') like '%auth.jwt()%'
        or coalesce(with_check, '') like '%auth.role()%'
        or coalesce(with_check, '') like '%auth.email()%'
      )
      and not (
        lower(coalesce(qual, '')) like '%select auth.%'
        or lower(coalesce(with_check, '')) like '%select auth.%'
      )
  loop
    v_using := v_policy.qual;
    v_check := v_policy.with_check;

    if v_using is not null then
      v_using := replace(v_using, 'auth.uid()', '(select auth.uid())');
      v_using := replace(v_using, 'auth.jwt()', '(select auth.jwt())');
      v_using := replace(v_using, 'auth.role()', '(select auth.role())');
      v_using := replace(v_using, 'auth.email()', '(select auth.email())');
    end if;

    if v_check is not null then
      v_check := replace(v_check, 'auth.uid()', '(select auth.uid())');
      v_check := replace(v_check, 'auth.jwt()', '(select auth.jwt())');
      v_check := replace(v_check, 'auth.role()', '(select auth.role())');
      v_check := replace(v_check, 'auth.email()', '(select auth.email())');
    end if;

    v_sql := format(
      'alter policy %I on %I.%I',
      v_policy.policyname,
      v_policy.schemaname,
      v_policy.tablename
    );

    if v_using is not null then
      v_sql := v_sql || format(' using (%s)', v_using);
    end if;

    if v_check is not null then
      v_sql := v_sql || format(' with check (%s)', v_check);
    end if;

    execute v_sql;
  end loop;
end;
$$;
