-- email_validation_runs: one row per validation batch
create table if not exists public.email_validation_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_label text,
  total integer not null default 0,
  valid_count integer not null default 0,
  invalid_syntax_count integer not null default 0,
  disposable_count integer not null default 0,
  role_based_count integer not null default 0,
  no_mx_count integer not null default 0,
  duplicate_count integer not null default 0
);

create index if not exists email_validation_runs_created_at_idx
  on public.email_validation_runs (created_at desc);

-- email_validations: one row per email validated
do $$ begin
  create type public.email_validation_status as enum (
    'valid',
    'invalid_syntax',
    'disposable',
    'role_based',
    'no_mx',
    'duplicate'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.email_validations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.email_validation_runs(id) on delete cascade,
  created_at timestamptz not null default now(),
  email text not null,
  normalized text not null,
  status public.email_validation_status not null,
  reason text,
  mx_found boolean
);

create index if not exists email_validations_run_id_idx
  on public.email_validations (run_id);

create index if not exists email_validations_normalized_idx
  on public.email_validations (normalized);

create index if not exists email_validations_status_idx
  on public.email_validations (status);

alter table public.email_validation_runs enable row level security;
alter table public.email_validations enable row level security;

-- Service role bypasses RLS; no anon policies by default.
-- Add explicit policies here if a non-service client needs access.
