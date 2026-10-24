begin;

create or replace function public.get_organization_history_counts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organization_id uuid;
begin
  if auth.uid() is null or not public.is_manager() then
    raise exception 'manager_access_required' using errcode = '42501';
  end if;

  v_organization_id := public.current_organization_id();
  if v_organization_id is null then
    raise exception 'active_organization_required' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'client_visits', coalesce((
      select sum(jsonb_array_length(client.visits))
        from public.clients as client
       where client.organization_id = v_organization_id
         and jsonb_typeof(client.visits) = 'array'
    ), 0),
    'appointments', (
      select count(*) from public.appointments as appointment
       where appointment.organization_id = v_organization_id
    ),
    'appointments_locked', (
      select count(*) from public.appointments as appointment
       where appointment.organization_id = v_organization_id
         and (
           appointment.attendance_recorded_at <= clock_timestamp() - interval '24 hours'
           or (
             appointment.attendance_recorded_at is null
             and (
               appointment.status = 'completed'
               or (
                 appointment.status = 'confirmed'
                 and (appointment.date || ' ' || appointment.time)::timestamp
                   <= timezone('America/Sao_Paulo', clock_timestamp())
               )
             )
           )
         )
    ),
    'expenses', (
      select count(*) from public.expenses as expense
       where expense.organization_id = v_organization_id
    ),
    'incomes', (
      select count(*) from public.incomes as income
       where income.organization_id = v_organization_id
    ),
    'finance_changes', (
      select count(*) from public.finance_entry_changes as change
       where change.organization_id = v_organization_id
    ),
    'prosthesis_sales', (
      select count(*) from public.prothesis_sales as sale
       where sale.organization_id = v_organization_id
    ),
    'mentoring_sessions', (
      select count(*) from public.mentoria_sessions as session
       where session.organization_id = v_organization_id
    ),
    'communication_sends', (
      select count(*) from public.communication_sends as send
       where send.organization_id = v_organization_id
    ),
    'subscription_payments', (
      select count(*) from public.subscription_payments as payment
       where payment.organization_id = v_organization_id
    ),
    'join_requests', (
      select count(*) from public.organization_join_requests as request
       where request.organization_id = v_organization_id
    ),
    'invitations', (
      select count(*) from public.organization_invitations as invitation
       where invitation.organization_id = v_organization_id
    ),
    'join_request_events', (
      select count(*) from public.organization_join_request_events as event
       where event.organization_id = v_organization_id
    )
  );
end;
$$;

create or replace function public.clear_organization_history(p_history_type text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organization_id uuid;
  v_deleted_count bigint := 0;
  v_visits_count bigint := 0;
  v_requests_count bigint := 0;
  v_invitations_count bigint := 0;
  v_events_count bigint := 0;
  v_expenses_count bigint := 0;
  v_incomes_count bigint := 0;
  v_changes_count bigint := 0;
  v_sales_count bigint := 0;
  v_sessions_count bigint := 0;
begin
  if auth.uid() is null or not public.is_manager() then
    raise exception 'manager_access_required' using errcode = '42501';
  end if;

  v_organization_id := public.current_organization_id();
  if v_organization_id is null then
    raise exception 'active_organization_required' using errcode = '42501';
  end if;

  if p_history_type = 'client_visits' then
    select coalesce(sum(jsonb_array_length(client.visits)), 0)
      into v_visits_count
      from public.clients as client
     where client.organization_id = v_organization_id
       and jsonb_typeof(client.visits) = 'array';

    update public.clients as client
       set visits = '[]'::jsonb,
           updated_at = now()
     where client.organization_id = v_organization_id
       and client.visits <> '[]'::jsonb;
    v_deleted_count := v_visits_count;

  elsif p_history_type = 'finance' then
    delete from public.expenses as expense
     where expense.organization_id = v_organization_id;
    get diagnostics v_expenses_count = row_count;

    delete from public.incomes as income
     where income.organization_id = v_organization_id;
    get diagnostics v_incomes_count = row_count;

    delete from public.finance_entry_changes as change
     where change.organization_id = v_organization_id;
    get diagnostics v_changes_count = row_count;
    v_deleted_count := v_expenses_count + v_incomes_count + v_changes_count;

  elsif p_history_type = 'sales' then
    delete from public.prothesis_sales as sale
     where sale.organization_id = v_organization_id;
    get diagnostics v_sales_count = row_count;

    delete from public.mentoria_sessions as session
     where session.organization_id = v_organization_id;
    get diagnostics v_sessions_count = row_count;
    v_deleted_count := v_sales_count + v_sessions_count;

  elsif p_history_type = 'communication' then
    delete from public.communication_sends as send
     where send.organization_id = v_organization_id;
    get diagnostics v_deleted_count = row_count;

  elsif p_history_type = 'subscription_payments' then
    delete from public.subscription_payments as payment
     where payment.organization_id = v_organization_id;
    get diagnostics v_deleted_count = row_count;

  elsif p_history_type = 'team_access' then
    select count(*) into v_events_count
      from public.organization_join_request_events as event
     where event.organization_id = v_organization_id;

    delete from public.organization_invitations as invitation
     where invitation.organization_id = v_organization_id;
    get diagnostics v_invitations_count = row_count;

    delete from public.organization_join_requests as request
     where request.organization_id = v_organization_id;
    get diagnostics v_requests_count = row_count;

    v_deleted_count := v_invitations_count + v_requests_count + v_events_count;

  else
    raise exception 'unsupported_history_type' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'history_type', p_history_type,
    'deleted_count', v_deleted_count,
    'appointments_deleted', 0
  );
end;
$$;

create or replace function public.delete_organization_history_item(
  p_history_type text,
  p_item_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organization_id uuid;
  v_deleted_count integer := 0;
begin
  if auth.uid() is null or not public.is_manager() then
    raise exception 'manager_access_required' using errcode = '42501';
  end if;

  v_organization_id := public.current_organization_id();
  if v_organization_id is null then
    raise exception 'active_organization_required' using errcode = '42501';
  end if;

  if p_item_id is null or btrim(p_item_id) = '' then
    return false;
  end if;

  if p_history_type = 'finance_change' then
    delete from public.finance_entry_changes as change
     where change.id = p_item_id::uuid
       and change.organization_id = v_organization_id;
  elsif p_history_type = 'communication_send' then
    delete from public.communication_sends as send
     where send.id = p_item_id::uuid
       and send.organization_id = v_organization_id;
  elsif p_history_type = 'subscription_payment' then
    delete from public.subscription_payments as payment
     where payment.id = p_item_id
       and payment.organization_id = v_organization_id;
  elsif p_history_type = 'join_request_event' then
    delete from public.organization_join_request_events as event
     where event.id = p_item_id::uuid
       and event.organization_id = v_organization_id;
  else
    raise exception 'unsupported_history_type' using errcode = '22023';
  end if;

  get diagnostics v_deleted_count = row_count;
  return v_deleted_count > 0;
exception
  when invalid_text_representation then
    return false;
end;
$$;

revoke all on function public.get_organization_history_counts() from public, anon;
revoke all on function public.clear_organization_history(text) from public, anon;
revoke all on function public.delete_organization_history_item(text, text) from public, anon;
grant execute on function public.get_organization_history_counts() to authenticated;
grant execute on function public.clear_organization_history(text) to authenticated;
grant execute on function public.delete_organization_history_item(text, text) to authenticated;

notify pgrst, 'reload schema';

commit;
