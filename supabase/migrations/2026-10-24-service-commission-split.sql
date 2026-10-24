begin;

alter table public.appointments
  add column if not exists service_commission_rate_snapshot numeric(5, 4);

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'appointments_service_commission_rate_snapshot_range'
       and conrelid = 'public.appointments'::regclass
  ) then
    alter table public.appointments
      add constraint appointments_service_commission_rate_snapshot_range
      check (
        service_commission_rate_snapshot is null
        or service_commission_rate_snapshot between 0 and 1
      );
  end if;
end
$$;

create or replace function public.validate_appointment_professional_commissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment jsonb;
  v_assignments jsonb;
  v_professional_id text;
  v_assignment_count integer;
  v_distinct_count integer;
  v_manual_total numeric := 0;
  v_commission_base numeric;
  v_expected_total numeric;
begin
  if tg_op = 'INSERT' then
    if new.attendance_recorded_at is null and new.status = 'completed' then
      new.attendance_recorded_at := now();
    end if;
    new.service_commission_rate_snapshot := case
      when new.attendance_recorded_at is not null then 0.5
      else null
    end;
  else
    new.service_commission_rate_snapshot := old.service_commission_rate_snapshot;
    if old.attendance_recorded_at is null
       and new.attendance_recorded_at is null
       and old.status is distinct from 'completed'
       and new.status = 'completed' then
      new.attendance_recorded_at := now();
    end if;
    if old.service_commission_rate_snapshot is null
       and old.attendance_recorded_at is null
       and new.attendance_recorded_at is not null then
      new.service_commission_rate_snapshot := 0.5;
    end if;
  end if;

  v_assignments := coalesce(new.professional_commissions, '[]'::jsonb);
  if jsonb_typeof(v_assignments) <> 'array' then
    raise exception 'manual_commissions_must_be_an_array' using errcode = 'P0001';
  end if;
  new.professional_commissions := v_assignments;
  v_assignment_count := jsonb_array_length(v_assignments);

  if v_assignment_count = 0 then
    return new;
  end if;
  if v_assignment_count < 2 then
    raise exception 'manual_commissions_require_multiple_professionals' using errcode = 'P0001';
  end if;

  select count(distinct value->>'professionalId')::integer
    into v_distinct_count
    from jsonb_array_elements(v_assignments) as assignment(value);
  if v_distinct_count <> v_assignment_count then
    raise exception 'duplicate_manual_commission_professional' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
      from jsonb_array_elements(v_assignments) as assignment(value)
     where assignment.value->>'professionalId' = new.professional_id
  ) then
    raise exception 'primary_professional_missing_from_manual_commissions' using errcode = 'P0001';
  end if;

  for v_assignment in
    select value from jsonb_array_elements(v_assignments) as assignment(value)
  loop
    v_professional_id := nullif(btrim(v_assignment->>'professionalId'), '');
    if jsonb_typeof(v_assignment) <> 'object'
       or v_professional_id is null
       or coalesce(v_assignment->>'amount', '') !~ '^[0-9]+([.][0-9]{1,2})?$' then
      raise exception 'invalid_manual_commission_assignment' using errcode = 'P0001';
    end if;

    v_manual_total := v_manual_total + (v_assignment->>'amount')::numeric;

    if not exists (
      select 1
        from public.professionals professional
       where professional.id = v_professional_id
         and professional.organization_id = new.organization_id
         and professional.is_active
    ) then
      raise exception 'manual_commission_professional_not_active' using errcode = 'P0001';
    end if;
  end loop;

  if new.service_commission_rate_snapshot is not null then
    v_commission_base := coalesce(
      nullif(new.plan_usage_value, 0)::numeric,
      new.value::numeric,
      0::numeric
    );
    v_expected_total := round(
      v_commission_base * new.service_commission_rate_snapshot::numeric,
      2
    );
    if round(v_manual_total, 2) <> v_expected_total then
      raise exception 'manual_commissions_must_equal_service_share' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.validate_appointment_professional_commissions()
  from public, anon, authenticated;
drop trigger if exists appointments_manual_commissions_validation on public.appointments;
create trigger appointments_manual_commissions_validation
before insert or update of
  professional_commissions,
  professional_id,
  organization_id,
  value,
  plan_usage_value,
  attendance_recorded_at,
  status,
  service_commission_rate_snapshot
on public.appointments
for each row execute function public.validate_appointment_professional_commissions();

do $$
begin
  if to_regprocedure('public.get_my_financial_earnings_legacy(date,date,text)') is null then
    execute 'alter function public.get_my_financial_earnings(date, date, text) rename to get_my_financial_earnings_legacy';
  end if;
  if to_regprocedure('public.get_my_plan_usage_earnings_legacy(date,date,text)') is null then
    execute 'alter function public.get_my_plan_usage_earnings(date, date, text) rename to get_my_plan_usage_earnings_legacy';
  end if;
end
$$;

revoke all on function public.get_my_financial_earnings_legacy(date, date, text)
  from public, anon, authenticated;
revoke all on function public.get_my_plan_usage_earnings_legacy(date, date, text)
  from public, anon, authenticated;

create or replace function public.get_my_financial_earnings(
  p_start_date date,
  p_end_date date,
  p_professional_id text default null
)
returns table (
  entry_id text,
  entry_date date,
  kind text,
  source text,
  attribution text,
  amount numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select
    legacy.entry_id,
    legacy.entry_date,
    legacy.kind,
    legacy.source,
    legacy.attribution,
    case
      when legacy.entry_id like '%:performer'
       and appointment.service_commission_rate_snapshot is not null
        then round(
          appointment.value::numeric * appointment.service_commission_rate_snapshot::numeric,
          2
        )
      else legacy.amount
    end as amount
  from public.get_my_financial_earnings_legacy(
    p_start_date,
    p_end_date,
    p_professional_id
  ) as legacy
  left join public.appointments appointment
    on appointment.id = split_part(legacy.entry_id, ':', 1)
  where not (
    legacy.entry_id like '%:performer'
    and coalesce(jsonb_array_length(appointment.professional_commissions), 0) > 1
  );
end;
$$;

create or replace function public.get_my_plan_usage_earnings(
  p_start_date date,
  p_end_date date,
  p_professional_id text default null
)
returns table (
  entry_id text,
  entry_date date,
  kind text,
  source text,
  attribution text,
  amount numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select
    legacy.entry_id,
    legacy.entry_date,
    legacy.kind,
    legacy.source,
    legacy.attribution,
    case
      when legacy.entry_id like '%:plan-performer'
       and appointment.service_commission_rate_snapshot is not null
        then round(
          appointment.plan_usage_value::numeric * appointment.service_commission_rate_snapshot::numeric,
          2
        )
      else legacy.amount
    end as amount
  from public.get_my_plan_usage_earnings_legacy(
    p_start_date,
    p_end_date,
    p_professional_id
  ) as legacy
  left join public.appointments appointment
    on appointment.id = split_part(legacy.entry_id, ':', 1)
  where not (
    legacy.entry_id like '%:plan-performer'
    and coalesce(jsonb_array_length(appointment.professional_commissions), 0) > 1
  );
end;
$$;

revoke all on function public.get_my_financial_earnings(date, date, text)
  from public, anon;
grant execute on function public.get_my_financial_earnings(date, date, text)
  to authenticated;
revoke all on function public.get_my_plan_usage_earnings(date, date, text)
  from public, anon;
grant execute on function public.get_my_plan_usage_earnings(date, date, text)
  to authenticated;

insert into public.schema_metadata (key, value)
values ('app_schema_version', '2026-10-24.1')
on conflict (key) do update
  set value = excluded.value, updated_at = now();

notify pgrst, 'reload schema';

commit;
