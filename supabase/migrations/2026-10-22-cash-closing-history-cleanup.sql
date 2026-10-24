begin;

create or replace function public.clear_organization_finance_history()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organization_id uuid;
  v_expenses_count bigint := 0;
  v_incomes_count bigint := 0;
  v_changes_count bigint := 0;
  v_closings_count bigint := 0;
begin
  if auth.uid() is null or not public.is_manager() then
    raise exception 'manager_access_required' using errcode = '42501';
  end if;

  v_organization_id := public.current_organization_id();
  if v_organization_id is null then
    raise exception 'active_organization_required' using errcode = '42501';
  end if;

  delete from public.expenses as expense
   where expense.organization_id = v_organization_id;
  get diagnostics v_expenses_count = row_count;

  delete from public.incomes as income
   where income.organization_id = v_organization_id;
  get diagnostics v_incomes_count = row_count;

  delete from public.finance_entry_changes as change
   where change.organization_id = v_organization_id;
  get diagnostics v_changes_count = row_count;

  delete from public.cash_closings as closing
   where closing.organization_id = v_organization_id;
  get diagnostics v_closings_count = row_count;

  return jsonb_build_object(
    'history_type', 'finance',
    'deleted_count', v_expenses_count + v_incomes_count + v_changes_count + v_closings_count,
    'appointments_deleted', 0
  );
end;
$$;

create or replace function public.delete_organization_cash_closing(p_item_id text)
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

  delete from public.cash_closings as closing
   where closing.id = p_item_id::uuid
     and closing.organization_id = v_organization_id;

  get diagnostics v_deleted_count = row_count;
  return v_deleted_count > 0;
exception
  when invalid_text_representation then
    return false;
end;
$$;

revoke all on function public.clear_organization_finance_history() from public, anon;
revoke all on function public.delete_organization_cash_closing(text) from public, anon;
grant execute on function public.clear_organization_finance_history() to authenticated;
grant execute on function public.delete_organization_cash_closing(text) to authenticated;

insert into public.schema_metadata (key, value)
values ('app_schema_version', '2026-10-22.2')
on conflict (key) do update
  set value = excluded.value, updated_at = now();

notify pgrst, 'reload schema';

commit;
