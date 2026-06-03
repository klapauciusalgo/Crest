create table if not exists public.ai_provider_configs (
  id uuid primary key default gen_random_uuid(),
  provider_name text not null,
  provider_type text not null default 'openai_compatible',
  base_url text not null,
  model text not null,
  encrypted_api_key text not null,
  api_key_hint text,
  status text not null default 'disabled',
  max_tokens integer not null default 900,
  temperature numeric(3,2) not null default 0.20,
  last_tested_at timestamptz,
  last_test_status text,
  last_test_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_provider_configs add column if not exists provider_name text;
alter table public.ai_provider_configs add column if not exists provider_type text;
alter table public.ai_provider_configs add column if not exists api_key_hint text;
alter table public.ai_provider_configs add column if not exists status text;
alter table public.ai_provider_configs add column if not exists max_tokens integer;
alter table public.ai_provider_configs add column if not exists temperature numeric(3,2);
alter table public.ai_provider_configs add column if not exists last_tested_at timestamptz;
alter table public.ai_provider_configs add column if not exists last_test_status text;
alter table public.ai_provider_configs add column if not exists last_test_error text;
alter table public.ai_provider_configs add column if not exists created_at timestamptz;
alter table public.ai_provider_configs add column if not exists updated_at timestamptz;

do $$
declare
  id_data_type text;
begin
  select data_type
    into id_data_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'ai_provider_configs'
    and column_name = 'id';

  if id_data_type = 'uuid' then
    execute 'alter table public.ai_provider_configs alter column id set default gen_random_uuid()';
  else
    execute $set_text_id_default$alter table public.ai_provider_configs alter column id set default ('aip_' || gen_random_uuid()::text)$set_text_id_default$;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ai_provider_configs'
      and column_name = 'provider'
  ) then
    execute $copy_provider$
      update public.ai_provider_configs
      set provider_name = coalesce(nullif(btrim(provider_name), ''), nullif(btrim(provider), ''), 'OpenAI compatible')
      where provider_name is null or btrim(provider_name) = ''
    $copy_provider$;
  end if;
end $$;

update public.ai_provider_configs
set
  provider_name = coalesce(nullif(btrim(provider_name), ''), 'OpenAI compatible'),
  provider_type = coalesce(nullif(btrim(provider_type), ''), 'openai_compatible'),
  encrypted_api_key = coalesce(nullif(btrim(encrypted_api_key), ''), 'legacy-missing-key'),
  status = case when status = 'active' then 'active' else 'disabled' end,
  max_tokens = coalesce(max_tokens, 900),
  temperature = coalesce(temperature, 0.20),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

alter table public.ai_provider_configs alter column provider_name set not null;
alter table public.ai_provider_configs alter column provider_type set not null;
alter table public.ai_provider_configs alter column encrypted_api_key set not null;
alter table public.ai_provider_configs alter column status set default 'disabled';
alter table public.ai_provider_configs alter column status set not null;
alter table public.ai_provider_configs alter column max_tokens set default 900;
alter table public.ai_provider_configs alter column max_tokens set not null;
alter table public.ai_provider_configs alter column temperature set default 0.20;
alter table public.ai_provider_configs alter column temperature set not null;
alter table public.ai_provider_configs alter column created_at set default now();
alter table public.ai_provider_configs alter column created_at set not null;
alter table public.ai_provider_configs alter column updated_at set default now();
alter table public.ai_provider_configs alter column updated_at set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ai_provider_configs_status_supported') then
    alter table public.ai_provider_configs
      add constraint ai_provider_configs_status_supported check (status in ('active', 'disabled'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'ai_provider_configs_max_tokens_range') then
    alter table public.ai_provider_configs
      add constraint ai_provider_configs_max_tokens_range check (max_tokens between 64 and 8192);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'ai_provider_configs_temperature_range') then
    alter table public.ai_provider_configs
      add constraint ai_provider_configs_temperature_range check (temperature >= 0 and temperature <= 2);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'ai_provider_configs_name_not_blank') then
    alter table public.ai_provider_configs
      add constraint ai_provider_configs_name_not_blank check (btrim(provider_name) <> '');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'ai_provider_configs_base_url_not_blank') then
    alter table public.ai_provider_configs
      add constraint ai_provider_configs_base_url_not_blank check (btrim(base_url) <> '');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'ai_provider_configs_model_not_blank') then
    alter table public.ai_provider_configs
      add constraint ai_provider_configs_model_not_blank check (btrim(model) <> '');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'ai_provider_configs_type_supported') then
    alter table public.ai_provider_configs
      add constraint ai_provider_configs_type_supported check (provider_type = 'openai_compatible');
  end if;
end $$;

create unique index if not exists ai_provider_configs_single_active_idx
on public.ai_provider_configs ((status))
where status = 'active';

create index if not exists ai_provider_configs_status_updated_idx
on public.ai_provider_configs (status, updated_at desc);

create table if not exists public.ai_settings (
  id boolean primary key default true check (id),
  weekly_prompt_limit integer not null default 5 check (weekly_prompt_limit between 0 and 1000),
  reset_timezone text not null default 'Asia/Jakarta',
  system_prompt text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.ai_settings (id, weekly_prompt_limit, reset_timezone, system_prompt)
values (true, 5, 'Asia/Jakarta', '')
on conflict (id) do nothing;

do $$
declare
  provider_id_type text;
begin
  select format_type(a.atttypid, a.atttypmod)
    into provider_id_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'ai_provider_configs'
    and a.attname = 'id'
    and not a.attisdropped;

  if to_regclass('public.ai_usage_events') is null then
    execute format($create_usage$
      create table public.ai_usage_events (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references auth.users(id) on delete cascade,
        week_start timestamptz not null,
        prompt text not null,
        provider_config_id %s references public.ai_provider_configs(id) on delete set null,
        thread_id uuid references public.ai_threads(id) on delete set null,
        created_at timestamptz not null default now()
      )
    $create_usage$, provider_id_type);
  else
    alter table public.ai_usage_events add column if not exists id uuid default gen_random_uuid();
    alter table public.ai_usage_events add column if not exists user_id uuid references auth.users(id) on delete cascade;
    alter table public.ai_usage_events add column if not exists week_start timestamptz;
    alter table public.ai_usage_events add column if not exists prompt text;
    alter table public.ai_usage_events add column if not exists thread_id uuid references public.ai_threads(id) on delete set null;
    alter table public.ai_usage_events add column if not exists created_at timestamptz default now();

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'ai_usage_events'
        and column_name = 'provider_config_id'
    ) then
      execute format(
        'alter table public.ai_usage_events add column provider_config_id %s references public.ai_provider_configs(id) on delete set null',
        provider_id_type
      );
    end if;
  end if;
end $$;

create index if not exists ai_usage_events_user_week_idx
on public.ai_usage_events (user_id, week_start, created_at desc);

drop trigger if exists set_ai_provider_configs_updated_at on public.ai_provider_configs;
create trigger set_ai_provider_configs_updated_at
before update on public.ai_provider_configs
for each row execute function private.set_updated_at();

drop trigger if exists set_ai_settings_updated_at on public.ai_settings;
create trigger set_ai_settings_updated_at
before update on public.ai_settings
for each row execute function private.set_updated_at();

alter table public.ai_provider_configs enable row level security;
alter table public.ai_settings enable row level security;
alter table public.ai_usage_events enable row level security;

revoke all on table public.ai_provider_configs from anon, authenticated;
revoke all on table public.ai_settings from anon, authenticated;
revoke all on table public.ai_usage_events from anon, authenticated;

grant all on table public.ai_provider_configs to service_role;
grant all on table public.ai_settings to service_role;
grant all on table public.ai_usage_events to service_role;

drop policy if exists "Service role can manage AI provider configs" on public.ai_provider_configs;
create policy "Service role can manage AI provider configs"
on public.ai_provider_configs
for all
to service_role
using (true)
with check (true);

drop policy if exists "Service role can manage AI settings" on public.ai_settings;
create policy "Service role can manage AI settings"
on public.ai_settings
for all
to service_role
using (true)
with check (true);

drop policy if exists "Service role can manage AI usage" on public.ai_usage_events;
create policy "Service role can manage AI usage"
on public.ai_usage_events
for all
to service_role
using (true)
with check (true);

notify pgrst, 'reload schema';
