begin;

create or replace function public.list_professional_account_emails()
returns table (
  professional_id text,
  email text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_organization_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required'
      using errcode = '28000';
  end if;

  v_organization_id := public.current_organization_id();

  if v_organization_id is null or not public.is_manager() then
    raise exception 'manager access required'
      using errcode = '42501';
  end if;

  return query
  select m.professional_id, u.email::text
    from public.organization_members as m
    join auth.users as u on u.id = m.user_id
   where m.organization_id = v_organization_id
     and m.is_active = true
     and m.professional_id is not null
     and nullif(btrim(u.email), '') is not null
   order by m.professional_id;
end;
$function$;

revoke all on function public.list_professional_account_emails()
  from public, anon, authenticated, service_role;
grant execute on function public.list_professional_account_emails()
  to authenticated;

insert into public.schema_metadata (key, value)
values ('app_schema_version', '2026-10-21.2')
on conflict (key) do update
  set value = excluded.value, updated_at = now();

commit;
