begin;

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
  appointment_rates as (
    select
      appointment.id,
      appointment.date::date as service_date,
      appointment.service,
      appointment.value::numeric as service_value,
      coalesce(appointment.tip, 0)::numeric as tip_value,
      appointment.professional_id,
      appointment.seller_professional_id,
      appointment.seller_is_company,
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
       where service.value->>'name' = appointment.service
       limit 1
    ) configured_service on true
    where appointment.organization_id = v_organization_id
      and appointment.date >= p_start_date::text
      and appointment.date <= p_end_date::text
      and appointment.status in ('confirmed', 'completed')
      and (
        appointment.professional_id = v_professional_id
        or (not appointment.seller_is_company and appointment.seller_professional_id = v_professional_id)
      )
  ),
  rated_appointments as (
    select appointment_rates.*,
      case
        when coalesce(appointment_rates.commissions->>appointment_rates.commission_key, '') ~ '^[0-9]+([.][0-9]+)?$'
         and (appointment_rates.commissions->>appointment_rates.commission_key)::numeric between 0 and 1
          then (appointment_rates.commissions->>appointment_rates.commission_key)::numeric
        else 0::numeric
      end as commission_rate
    from appointment_rates
  ),
  earnings as (
    select
      appointment.id || ':performer' as earning_id,
      appointment.service_date as earning_date,
      'commission'::text as earning_kind,
      'Comissão por execução · ' || appointment.service as earning_source,
      'Atendimento'::text as earning_attribution,
      round(appointment.service_value * appointment.commission_rate, 2) as earning_amount
    from rated_appointments appointment
    where appointment.professional_id = v_professional_id

    union all

    select
      appointment.id || ':seller' as earning_id,
      appointment.service_date as earning_date,
      'commission'::text as earning_kind,
      'Comissão por venda · ' || appointment.service as earning_source,
      'Atendimento'::text as earning_attribution,
      round(appointment.service_value * appointment.commission_rate, 2) as earning_amount
    from rated_appointments appointment
    where not appointment.seller_is_company
      and appointment.seller_professional_id = v_professional_id

    union all

    select
      appointment.id || ':tip' as earning_id,
      appointment.service_date as earning_date,
      'tip'::text as earning_kind,
      'Gorjeta'::text as earning_source,
      'Atendimento · ' || appointment.service as earning_attribution,
      round(appointment.tip_value, 2) as earning_amount
    from rated_appointments appointment
    where appointment.professional_id = v_professional_id
      and appointment.tip_value > 0

    union all

    select
      sale.id || ':prothesis' as earning_id,
      sale.date::date as earning_date,
      'commission'::text as earning_kind,
      'Comissão de venda · Prótese Capilar'::text as earning_source,
      'Venda própria · ' || sale.installments_paid::text || '/' || sale.installments::text || ' parcelas pagas' as earning_attribution,
      round(
        sale.value::numeric * sale.installments_paid::numeric / sale.installments::numeric *
        case
          when coalesce(selected_professional.commissions->>'protese', '') ~ '^[0-9]+([.][0-9]+)?$'
           and (selected_professional.commissions->>'protese')::numeric between 0 and 1
            then (selected_professional.commissions->>'protese')::numeric
          else 0::numeric
        end,
        2
      ) as earning_amount
    from public.prothesis_sales sale
    join selected_professional on selected_professional.id = sale.seller_id
    where sale.organization_id = v_organization_id
      and sale.date >= p_start_date::text
      and sale.date <= p_end_date::text
      and sale.installments_paid > 0

    union all

    select
      session.id || ':mentoria' as earning_id,
      session.date::date as earning_date,
      'commission'::text as earning_kind,
      'Comissão de venda · Mentoria'::text as earning_source,
      'Mentoria concluída'::text as earning_attribution,
      round(
        session.value::numeric *
        case
          when coalesce(selected_professional.commissions->>'mentoria', '') ~ '^[0-9]+([.][0-9]+)?$'
           and (selected_professional.commissions->>'mentoria')::numeric between 0 and 1
            then (selected_professional.commissions->>'mentoria')::numeric
          else 0::numeric
        end,
        2
      ) as earning_amount
    from public.mentoria_sessions session
    join selected_professional on selected_professional.id = session.seller_id
    where session.organization_id = v_organization_id
      and session.date >= p_start_date::text
      and session.date <= p_end_date::text
      and session.status = 'completed'
  )
  select earning_id, earning_date, earning_kind, earning_source, earning_attribution, earning_amount
    from earnings
   where earning_amount > 0
   order by earning_date desc, earning_id;
end;
$$;

revoke all on function public.get_my_financial_earnings(date, date, text) from public, anon, authenticated;
grant execute on function public.get_my_financial_earnings(date, date, text) to authenticated;

-- Employees in these roles may see their own earnings through the RPC only.
-- Managers and other explicitly authorized roles keep the existing finance access.
do $$
declare
  table_name text;
  existing_policy record;
begin
  foreach table_name in array array['expenses', 'incomes'] loop
    for existing_policy in
      select policyname
        from pg_policies as policies
       where policies.schemaname = 'public'
         and policies.tablename = table_name
    loop
      execute format('drop policy %I on public.%I', existing_policy.policyname, table_name);
    end loop;

    execute format(
      'create policy %I on public.%I for select to authenticated using (
        organization_id = public.current_organization_id()
        and public.current_user_role() not in (''barbeiro'', ''manicure'', ''vendedor'')
        and public.has_permission(''financeiro'')
      )',
      table_name || '_select_member', table_name
    );
    execute format(
      'create policy %I on public.%I for all to authenticated
        using (
          organization_id = public.current_organization_id()
          and public.current_user_role() not in (''barbeiro'', ''manicure'', ''vendedor'')
          and public.has_permission(''financeiro'')
        )
        with check (
          organization_id = public.current_organization_id()
          and public.current_user_role() not in (''barbeiro'', ''manicure'', ''vendedor'')
          and public.has_permission(''financeiro'')
        )',
      table_name || '_manager_write', table_name
    );
  end loop;
end;
$$;

insert into public.schema_metadata (key, value)
values ('app_schema_version', '2026-10-23.2')
on conflict (key) do update
  set value = excluded.value, updated_at = now();

commit;
