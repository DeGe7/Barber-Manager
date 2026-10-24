begin;

alter table public.organization_join_requests
  add column if not exists hidden_at timestamptz;

alter table public.organization_join_request_events
  drop constraint if exists organization_join_request_events_event_type_check;

alter table public.organization_join_request_events
  add constraint organization_join_request_events_event_type_check
  check (
    event_type in (
      'request_submitted',
      'request_approved',
      'request_rejected',
      'request_archived',
      'request_reopened',
      'invitation_created',
      'invitation_email_status',
      'invitation_revoked',
      'invitation_accepted'
    )
  );

create or replace function public.archive_rejected_organization_join_request(p_request_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organization_id uuid;
  v_hidden_at timestamptz;
  v_actor_name text;
begin
  if auth.uid() is null or not public.is_manager() then
    raise exception 'only managers can archive rejected access requests';
  end if;

  v_organization_id := public.current_organization_id();
  if v_organization_id is null then
    raise exception 'active organization required';
  end if;

  update public.organization_join_requests as request
     set hidden_at = coalesce(request.hidden_at, clock_timestamp())
   where request.id = p_request_id
     and request.organization_id = v_organization_id
     and request.status = 'rejected'
   returning request.hidden_at into v_hidden_at;

  if not found then
    raise exception 'rejected access request not found';
  end if;

  select nullif(btrim(profile.full_name), '')
    into v_actor_name
    from public.profiles as profile
   where profile.id = auth.uid();

  insert into public.organization_join_request_events (
    event_key,
    organization_id,
    request_id,
    event_type,
    actor_id,
    actor_name,
    metadata,
    created_at
  ) values (
    'request:' || p_request_id::text || ':archived:' ||
      to_char(v_hidden_at at time zone 'UTC', 'YYYYMMDDHH24MISSUS'),
    v_organization_id,
    p_request_id,
    'request_archived',
    auth.uid(),
    v_actor_name,
    jsonb_build_object('hidden_at', v_hidden_at),
    v_hidden_at
  )
  on conflict (event_key) do nothing;

  return v_hidden_at;
end;
$$;

revoke all on function public.archive_rejected_organization_join_request(uuid) from public, anon, authenticated;
grant execute on function public.archive_rejected_organization_join_request(uuid) to authenticated;

insert into public.schema_metadata (key, value)
values ('app_schema_version', '2026-10-22.1')
on conflict (key) do update
  set value = excluded.value, updated_at = now();

commit;
