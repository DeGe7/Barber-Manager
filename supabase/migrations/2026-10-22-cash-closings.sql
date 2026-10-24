begin;

create table if not exists public.cash_closings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  frequency text not null check (frequency in ('weekly', 'monthly')),
  total_income numeric(14, 2) not null default 0,
  total_expenses numeric(14, 2) not null default 0,
  net_total numeric(14, 2) not null default 0,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint cash_closings_period_valid check (period_start <= period_end),
  constraint cash_closings_totals_valid check (
    total_income >= 0 and total_expenses >= 0 and net_total = total_income - total_expenses
  ),
  constraint cash_closings_org_period_unique unique (organization_id, period_start, period_end)
);

create index if not exists cash_closings_org_period_end_idx
  on public.cash_closings (organization_id, period_end desc);

alter table public.cash_closings enable row level security;
revoke all on table public.cash_closings from public, anon, authenticated;
grant select, insert on table public.cash_closings to authenticated;

drop policy if exists cash_closings_select_manager on public.cash_closings;
create policy cash_closings_select_manager
  on public.cash_closings
  for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_manager()
  );

drop policy if exists cash_closings_insert_manager on public.cash_closings;
create policy cash_closings_insert_manager
  on public.cash_closings
  for insert to authenticated
  with check (
    organization_id = public.current_organization_id()
    and created_by = auth.uid()
    and public.is_manager()
  );

insert into public.schema_metadata (key, value)
values ('app_schema_version', '2026-10-22.1')
on conflict (key) do update
  set value = excluded.value, updated_at = now();

commit;
