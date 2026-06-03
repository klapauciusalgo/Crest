do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ai_provider_configs'
      and column_name = 'user_id'
  ) then
    alter table public.ai_provider_configs alter column user_id drop not null;
    alter table public.ai_provider_configs alter column user_id drop default;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ai_provider_configs'
      and column_name = 'provider'
  ) then
    alter table public.ai_provider_configs alter column provider drop not null;
    alter table public.ai_provider_configs alter column provider set default 'OpenAI compatible';
  end if;
end $$;

notify pgrst, 'reload schema';
