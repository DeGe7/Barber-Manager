begin;

alter table public.subscribers
  add column if not exists usage_started_at timestamptz;

update public.subscribers
   set usage_started_at = coalesce(usage_started_at, created_at, now())
 where usage_started_at is null;

alter table public.subscribers
  alter column usage_started_at set default now(),
  alter column usage_started_at set not null;

alter table public.appointments
  add column if not exists service_id text,
  add column if not exists plan_subscriber_id text,
  add column if not exists plan_usage_value double precision not null default 0,
  add column if not exists professional_commissions jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'appointments_plan_subscriber_id_fkey'
       and conrelid = 'public.appointments'::regclass
  ) then
    alter table public.appointments
      add constraint appointments_plan_subscriber_id_fkey
      foreign key (plan_subscriber_id)
      references public.subscribers(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'appointments_plan_usage_value_nonnegative'
       and conrelid = 'public.appointments'::regclass
  ) then
    alter table public.appointments
      add constraint appointments_plan_usage_value_nonnegative
      check (plan_usage_value >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'appointments_professional_commissions_array'
       and conrelid = 'public.appointments'::regclass
  ) then
    alter table public.appointments
      add constraint appointments_professional_commissions_array
      check (jsonb_typeof(professional_commissions) = 'array');
  end if;
end;
$$;

create index if not exists appointments_plan_usage_idx
  on public.appointments (plan_subscriber_id, service_id, attendance_recorded_at)
  where plan_subscriber_id is not null;

create or replace function public.validate_plan_appointment_usage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscriber public.subscribers;
  v_plan public.subscription_plans;
  v_service_limit integer;
  v_total_uses integer;
  v_used integer;
  v_today date;
  v_subscriber_phone text;
  v_client_phone text;
  v_client_name text;
begin
  -- Keep the allocated value on old appointments if a subscriber is removed.
  if tg_op = 'UPDATE'
     and old.plan_subscriber_id is not null
     and new.plan_subscriber_id is null then
    new.plan_usage_value := old.plan_usage_value;
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.plan_subscriber_id is not null
     and new.plan_subscriber_id is not distinct from old.plan_subscriber_id
     and new.organization_id is not distinct from old.organization_id
     and new.service_id is not distinct from old.service_id
     and new.service is not distinct from old.service
     and new.client_id is not distinct from old.client_id
     and new.status is not distinct from old.status
     and new.attendance_recorded_at is not distinct from old.attendance_recorded_at then
    new.value := 0;
    new.plan_usage_value := old.plan_usage_value;
    return new;
  end if;

  if new.plan_subscriber_id is null then
    new.plan_usage_value := 0;
    return new;
  end if;

  new.value := 0;

  if coalesce(auth.role(), '') <> 'service_role'
     and new.organization_id is distinct from public.current_organization_id() then
    raise exception 'plan_usage_wrong_organization' using errcode = '42501';
  end if;

  select subscriber.*
    into v_subscriber
    from public.subscribers subscriber
   where subscriber.id = new.plan_subscriber_id
     and subscriber.organization_id = new.organization_id
   for update;

  if not found then
    raise exception 'plan_subscriber_not_found' using errcode = 'P0001';
  end if;

  select plan.*
    into v_plan
    from public.subscription_plans plan
   where plan.id = v_subscriber.plan_id
     and plan.organization_id = v_subscriber.organization_id;

  if not found then
    raise exception 'plan_subscriber_plan_not_found' using errcode = 'P0001';
  end if;

  v_today := timezone('America/Sao_Paulo', clock_timestamp())::date;
  if v_subscriber.status <> 'ativo'
     or v_subscriber.next_payment::date < v_today then
    raise exception 'plan_subscriber_inactive' using errcode = 'P0001';
  end if;

  v_subscriber_phone := regexp_replace(coalesce(v_subscriber.phone, ''), '[^0-9]', '', 'g');
  if left(v_subscriber_phone, 2) = '55' and length(v_subscriber_phone) in (12, 13) then
    v_subscriber_phone := substring(v_subscriber_phone from 3);
  end if;
  if new.client_id is null then
    raise exception 'plan_subscriber_client_mismatch' using errcode = 'P0001';
  end if;

  select client.whatsapp, client.name
    into v_client_phone, v_client_name
    from public.clients client
   where client.id = new.client_id
     and client.organization_id = new.organization_id;
  if not found then
    raise exception 'plan_subscriber_client_mismatch' using errcode = 'P0001';
  end if;

  v_client_phone := regexp_replace(coalesce(v_client_phone, ''), '[^0-9]', '', 'g');
  if left(v_client_phone, 2) = '55' and length(v_client_phone) in (12, 13) then
    v_client_phone := substring(v_client_phone from 3);
  end if;
  if not (
    (v_subscriber_phone <> '' and v_client_phone = v_subscriber_phone)
    or (
      v_subscriber_phone = ''
      and lower(btrim(v_client_name)) = lower(btrim(v_subscriber.name))
    )
  ) then
    raise exception 'plan_subscriber_client_mismatch' using errcode = 'P0001';
  end if;

  if new.service_id is null or not exists (
    select 1
      from public.organization_settings settings
      cross join lateral jsonb_array_elements(
        case
          when jsonb_typeof(settings.payload->'services') = 'array'
            then settings.payload->'services'
          else '[]'::jsonb
        end
      ) as configured_service(value)
     where settings.organization_id = new.organization_id
       and configured_service.value->>'id' = new.service_id
       and configured_service.value->>'name' = new.service
       and coalesce((configured_service.value->>'isActive')::boolean, true)
  ) then
    raise exception 'plan_service_not_configured' using errcode = 'P0001';
  end if;

  select max(
           case
             when coalesce(service.value->>'usesPerCycle', '') ~ '^[0-9]+$'
               then (service.value->>'usesPerCycle')::integer
             else 0
           end
         )
    into v_service_limit
    from jsonb_array_elements(
      case
        when jsonb_typeof(v_plan.services) = 'array' then v_plan.services
        else '[]'::jsonb
      end
    ) as service(value)
   where jsonb_typeof(service.value) = 'object'
     and service.value->>'serviceId' = new.service_id;

  select coalesce(sum(
           case
             when coalesce(service.value->>'usesPerCycle', '') ~ '^[0-9]+$'
               then greatest((service.value->>'usesPerCycle')::integer, 0)
             else 0
           end
         ), 0)
    into v_total_uses
    from jsonb_array_elements(
      case
        when jsonb_typeof(v_plan.services) = 'array' then v_plan.services
        else '[]'::jsonb
      end
    ) as service(value)
   where jsonb_typeof(service.value) = 'object';

  if coalesce(v_service_limit, 0) < 1 or v_total_uses < 1 then
    raise exception 'plan_service_not_included' using errcode = 'P0001';
  end if;

  if new.status not in ('confirmed', 'completed') or new.attendance_recorded_at is null then
    new.plan_usage_value := 0;
    return new;
  end if;

  select count(*)::integer
    into v_used
    from public.appointments appointment
   where appointment.plan_subscriber_id = v_subscriber.id
     and appointment.service_id = new.service_id
     and appointment.organization_id = new.organization_id
     and appointment.status in ('confirmed', 'completed')
     and appointment.attendance_recorded_at >= v_subscriber.usage_started_at
     and (tg_op <> 'UPDATE' or appointment.id <> new.id);

  if v_used >= v_service_limit then
    raise exception 'plan_usage_exhausted' using errcode = 'P0001';
  end if;

  -- The actual payment remains recorded once, as a subscription payment.
  -- This per-use share is only the commission base for the assigned professional.
  new.plan_usage_value := v_plan.price / v_total_uses;
  return new;
end;
$$;

revoke all on function public.validate_plan_appointment_usage()
  from public, anon, authenticated;

drop trigger if exists appointments_plan_usage_validation on public.appointments;
create trigger appointments_plan_usage_validation
before insert or update of
  client, client_id, organization_id, plan_subscriber_id, service, service_id,
  status, attendance_recorded_at, value, plan_usage_value
on public.appointments
for each row execute function public.validate_plan_appointment_usage();

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
begin
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

  return new;
end;
$$;

revoke all on function public.validate_appointment_professional_commissions()
  from public, anon, authenticated;

drop trigger if exists appointments_manual_commissions_validation on public.appointments;
create trigger appointments_manual_commissions_validation
before insert or update of professional_commissions, professional_id, organization_id
on public.appointments
for each row execute function public.validate_appointment_professional_commissions();

create or replace function public.renew_subscriber_plan_usages(p_subscriber_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscriber public.subscribers;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if not (public.is_manager() or public.has_permission('planos')) then
    raise exception 'user_does_not_have_permission_to_renew_plan_usages' using errcode = '42501';
  end if;

  update public.subscribers subscriber
     set usage_started_at = clock_timestamp(),
         updated_at = now()
   where subscriber.id = p_subscriber_id
     and subscriber.organization_id = public.current_organization_id()
  returning subscriber.* into v_subscriber;

  if not found then
    raise exception 'subscriber_not_found' using errcode = 'P0001';
  end if;

  return to_jsonb(v_subscriber);
end;
$$;

revoke all on function public.renew_subscriber_plan_usages(text) from public, anon;
grant execute on function public.renew_subscriber_plan_usages(text) to authenticated;

create or replace function public.reset_subscriber_plan_usages_on_plan_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.plan_id is distinct from old.plan_id then
    new.usage_started_at := clock_timestamp();
  end if;
  return new;
end;
$$;

revoke all on function public.reset_subscriber_plan_usages_on_plan_change()
  from public, anon, authenticated;

drop trigger if exists subscribers_reset_usages_on_plan_change on public.subscribers;
create trigger subscribers_reset_usages_on_plan_change
before update of plan_id on public.subscribers
for each row execute function public.reset_subscriber_plan_usages_on_plan_change();

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
declare
  v_organization_id uuid;
  v_professional_id text;
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  v_organization_id := public.current_organization_id();
  v_role := public.current_user_role();
  if v_organization_id is null then
    raise exception 'active_organization_required' using errcode = '42501';
  end if;
  if v_role not in ('gestor', 'dev-admin', 'barbeiro', 'manicure', 'vendedor') then
    raise exception 'personal_finance_not_available_for_role' using errcode = '42501';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'invalid_finance_period' using errcode = '22023';
  end if;

  if public.is_manager() then
    v_professional_id := coalesce(p_professional_id, public.current_professional_id());
  else
    if p_professional_id is not null then
      raise exception 'cannot_request_another_professional_earnings' using errcode = '42501';
    end if;
    v_professional_id := public.current_professional_id();
  end if;

  if v_professional_id is null or not exists (
    select 1
      from public.professionals professional
     where professional.id = v_professional_id
       and professional.organization_id = v_organization_id
  ) then
    raise exception 'active_professional_profile_required' using errcode = '42501';
  end if;

  return query
  with selected_professional as (
    select professional.id, professional.commissions
      from public.professionals professional
     where professional.id = v_professional_id
       and professional.organization_id = v_organization_id
  ),
  usage_rates as (
    select
      appointment.id,
      appointment.date::date as service_date,
      appointment.service,
      appointment.plan_usage_value::numeric as commission_base,
      appointment.professional_id,
      appointment.seller_professional_id,
      appointment.seller_is_company,
      appointment.professional_commissions,
      subscriber.name as subscriber_name,
      plan.name as plan_name,
      selected_professional.commissions,
      coalesce(
        nullif(configured_service.value->>'commissionKey', ''),
        case
          when translate(lower(appointment.service), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') like '%manicure%' then 'manicure'
          when translate(lower(appointment.service), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') like '%manuten%' then 'manutencao'
          when translate(lower(appointment.service), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') like '%protese%' then 'protese'
          when lower(appointment.service) like '%mentoria%' then 'mentoria'
          else 'barbearia'
        end
      ) as commission_key
    from public.appointments appointment
    join selected_professional on true
    join public.subscribers subscriber
      on subscriber.id = appointment.plan_subscriber_id
     and subscriber.organization_id = appointment.organization_id
    join public.subscription_plans plan
      on plan.id = subscriber.plan_id
     and plan.organization_id = subscriber.organization_id
    left join public.organization_settings settings
      on settings.organization_id = v_organization_id
    left join lateral (
      select service.value
        from jsonb_array_elements(
          case
            when jsonb_typeof(settings.payload->'services') = 'array'
              then settings.payload->'services'
            else '[]'::jsonb
          end
        ) as service(value)
       where service.value->>'id' = appointment.service_id
          or (appointment.service_id is null and service.value->>'name' = appointment.service)
       limit 1
    ) configured_service on true
    where appointment.organization_id = v_organization_id
      and appointment.date >= p_start_date::text
      and appointment.date <= p_end_date::text
      and appointment.status in ('confirmed', 'completed')
      and appointment.attendance_recorded_at is not null
      and appointment.plan_subscriber_id is not null
      and (
        appointment.professional_id = v_professional_id
        or (not appointment.seller_is_company and appointment.seller_professional_id = v_professional_id)
      )
  ),
  rated_usage as (
    select usage_rates.*,
      case
        when coalesce(usage_rates.commissions->>usage_rates.commission_key, '') ~ '^[0-9]+([.][0-9]+)?$'
         and (usage_rates.commissions->>usage_rates.commission_key)::numeric between 0 and 1
          then (usage_rates.commissions->>usage_rates.commission_key)::numeric
        else 0::numeric
      end as commission_rate
    from usage_rates
  )
  select
    usage.id || ':plan-performer' as earning_id,
    usage.service_date as earning_date,
    'commission'::text as earning_kind,
    'Comissão por execução via plano · ' || usage.service as earning_source,
    'Atendimento de ' || usage.subscriber_name || ' · ' || usage.plan_name as earning_attribution,
    round(usage.commission_base * usage.commission_rate, 2) as earning_amount
  from rated_usage usage
  where usage.professional_id = v_professional_id
    and jsonb_array_length(usage.professional_commissions) <= 1
    and usage.commission_base > 0
    and usage.commission_rate > 0;

  return query
  with selected_professional as (
    select professional.id, professional.commissions
      from public.professionals professional
     where professional.id = v_professional_id
       and professional.organization_id = v_organization_id
  )
  select
    appointment.id || ':plan-seller' as earning_id,
    appointment.date::date as earning_date,
    'commission'::text as earning_kind,
    'Comissão por venda via plano · ' || appointment.service as earning_source,
    'Atendimento de ' || subscriber.name || ' · ' || plan.name as earning_attribution,
    round(
      appointment.plan_usage_value::numeric *
      case
        when coalesce(selected_professional.commissions->>coalesce(
          nullif(configured_service.value->>'commissionKey', ''),
          'barbearia'
        ), '') ~ '^[0-9]+([.][0-9]+)?$'
         and (selected_professional.commissions->>coalesce(
           nullif(configured_service.value->>'commissionKey', ''),
           'barbearia'
         ))::numeric between 0 and 1
          then (selected_professional.commissions->>coalesce(
            nullif(configured_service.value->>'commissionKey', ''),
            'barbearia'
          ))::numeric
        else 0::numeric
      end,
      2
    ) as earning_amount
  from public.appointments appointment
  join selected_professional on selected_professional.id = appointment.seller_professional_id
  join public.subscribers subscriber
    on subscriber.id = appointment.plan_subscriber_id
   and subscriber.organization_id = appointment.organization_id
  join public.subscription_plans plan
    on plan.id = subscriber.plan_id
   and plan.organization_id = subscriber.organization_id
  left join public.organization_settings settings
    on settings.organization_id = v_organization_id
  left join lateral (
    select service.value
      from jsonb_array_elements(
        case
          when jsonb_typeof(settings.payload->'services') = 'array'
            then settings.payload->'services'
          else '[]'::jsonb
        end
      ) as service(value)
     where service.value->>'id' = appointment.service_id
        or (appointment.service_id is null and service.value->>'name' = appointment.service)
     limit 1
  ) configured_service on true
  where appointment.organization_id = v_organization_id
    and appointment.date >= p_start_date::text
    and appointment.date <= p_end_date::text
    and appointment.status in ('confirmed', 'completed')
    and appointment.attendance_recorded_at is not null
    and appointment.plan_subscriber_id is not null
    and not appointment.seller_is_company
    and appointment.plan_usage_value > 0
    and case
      when coalesce(selected_professional.commissions->>coalesce(
        nullif(configured_service.value->>'commissionKey', ''),
        'barbearia'
      ), '') ~ '^[0-9]+([.][0-9]+)?$'
        then (selected_professional.commissions->>coalesce(
          nullif(configured_service.value->>'commissionKey', ''),
          'barbearia'
        ))::numeric > 0
      else false
    end;
end;
$$;

revoke all on function public.get_my_plan_usage_earnings(date, date, text)
  from public, anon;
grant execute on function public.get_my_plan_usage_earnings(date, date, text)
  to authenticated;

create or replace function public.get_my_manual_appointment_commissions(
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
declare
  v_organization_id uuid;
  v_professional_id text;
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  v_organization_id := public.current_organization_id();
  v_role := public.current_user_role();
  if v_organization_id is null then
    raise exception 'active_organization_required' using errcode = '42501';
  end if;
  if v_role not in ('gestor', 'dev-admin', 'barbeiro', 'manicure', 'vendedor') then
    raise exception 'personal_finance_not_available_for_role' using errcode = '42501';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'invalid_finance_period' using errcode = '22023';
  end if;

  if public.is_manager() then
    v_professional_id := coalesce(p_professional_id, public.current_professional_id());
  else
    if p_professional_id is not null then
      raise exception 'cannot_request_another_professional_earnings' using errcode = '42501';
    end if;
    v_professional_id := public.current_professional_id();
  end if;

  if v_professional_id is null or not exists (
    select 1
      from public.professionals professional
     where professional.id = v_professional_id
       and professional.organization_id = v_organization_id
  ) then
    raise exception 'active_professional_profile_required' using errcode = '42501';
  end if;

  return query
  select
    appointment.id || ':manual:' || v_professional_id as earning_id,
    appointment.date::date as earning_date,
    'commission'::text as earning_kind,
    'Comissão manual · ' || appointment.service as earning_source,
    'Atendimento de ' || appointment.client as earning_attribution,
    case
      when coalesce(assignment.value->>'amount', '') ~ '^[0-9]+([.][0-9]{1,2})?$'
        then (assignment.value->>'amount')::numeric
      else 0::numeric
    end as earning_amount
  from public.appointments appointment
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(appointment.professional_commissions) = 'array'
        then appointment.professional_commissions
      else '[]'::jsonb
    end
  ) as assignment(value)
  where appointment.organization_id = v_organization_id
    and appointment.date::date between p_start_date and p_end_date
    and appointment.status in ('confirmed', 'completed')
    and appointment.attendance_recorded_at is not null
    and jsonb_array_length(appointment.professional_commissions) > 1
    and assignment.value->>'professionalId' = v_professional_id;
end;
$$;

revoke all on function public.get_my_manual_appointment_commissions(date, date, text)
  from public, anon;
grant execute on function public.get_my_manual_appointment_commissions(date, date, text)
  to authenticated;

insert into public.schema_metadata (key, value)
values ('app_schema_version', '2026-10-23.7')
on conflict (key) do update
  set value = excluded.value, updated_at = now();

notify pgrst, 'reload schema';

commit;
