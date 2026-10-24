begin;

alter table public.organization_invitations
  add column if not exists join_request_id uuid;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'organization_invitations_join_request_id_fkey'
       and conrelid = 'public.organization_invitations'::regclass
  ) then
    alter table public.organization_invitations
      add constraint organization_invitations_join_request_id_fkey
      foreign key (join_request_id)
      references public.organization_join_requests(id)
      on delete set null;
  end if;
end;
$$;

create table if not exists public.organization_join_request_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_id uuid not null references public.organization_join_requests(id) on delete cascade,
  event_type text not null check (
    event_type in (
      'request_submitted',
      'request_approved',
      'request_rejected',
      'request_reopened',
      'invitation_created',
      'invitation_email_status',
      'invitation_revoked',
      'invitation_accepted'
    )
  ),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text,
  invitation_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists organization_join_request_events_history_idx
  on public.organization_join_request_events (organization_id, request_id, created_at);

-- Link existing invitations only when there is exactly one unambiguous
-- approved request for the same company, email, and professional.
with matching_requests as (
  select
    invitation.id as invitation_id,
    (array_agg(
      request.id
      order by request.reviewed_at desc nulls last, request.requested_at desc
    ))[1] as request_id
  from public.organization_invitations as invitation
  join public.organization_join_requests as request
    on request.organization_id = invitation.organization_id
   and request.professional_id = invitation.professional_id
   and lower(coalesce(request.applicant_email, '')) = lower(coalesce(invitation.email, ''))
   and request.status = 'approved'
   and request.reviewed_at is not null
   and invitation.created_at >= request.reviewed_at
  where invitation.join_request_id is null
    and invitation.email is not null
    and invitation.professional_id is not null
  group by invitation.id
  having count(*) = 1
)
update public.organization_invitations as invitation
   set join_request_id = matching_requests.request_id
  from matching_requests
 where invitation.id = matching_requests.invitation_id
   and invitation.join_request_id is null;

-- Backfill the events that can be recovered from the current request rows.
insert into public.organization_join_request_events (
  event_key, organization_id, request_id, event_type, actor_id, actor_name, metadata, created_at
)
select
  'request:' || request.id::text || ':submitted',
  request.organization_id,
  request.id,
  'request_submitted',
  request.user_id,
  request.applicant_name,
  '{}'::jsonb,
  request.requested_at
from public.organization_join_requests as request
on conflict (event_key) do nothing;

insert into public.organization_join_request_events (
  event_key, organization_id, request_id, event_type, actor_id, actor_name, metadata, created_at
)
select
  format('request:%s:%s:%s', request.id, event.event_type, request.reviewed_at::text),
  request.organization_id,
  request.id,
  event.event_type,
  request.reviewed_by,
  coalesce(
    nullif(btrim(profile.full_name), ''),
    nullif(btrim(profile.email), ''),
    'Gestor'
  ),
  jsonb_strip_nulls(jsonb_build_object('professional_id', request.professional_id)),
  request.reviewed_at
from public.organization_join_requests as request
left join public.profiles as profile on profile.id = request.reviewed_by
cross join lateral (
  select case
    when request.status = 'approved' then 'request_approved'
    when request.status = 'rejected' then 'request_rejected'
  end as event_type
) as event
where request.status in ('approved', 'rejected')
  and request.reviewed_at is not null
on conflict (event_key) do nothing;

insert into public.organization_join_request_events (
  event_key, organization_id, request_id, event_type, actor_id, actor_name, invitation_id, metadata, created_at
)
select
  'invitation:' || invitation.id::text || ':created',
  invitation.organization_id,
  invitation.join_request_id,
  'invitation_created',
  invitation.invited_by,
  coalesce(nullif(btrim(invitation.invited_by_name), ''), 'Gestor'),
  invitation.id,
  '{}'::jsonb,
  invitation.created_at
from public.organization_invitations as invitation
where invitation.join_request_id is not null
on conflict (event_key) do nothing;

insert into public.organization_join_request_events (
  event_key, organization_id, request_id, event_type, actor_id, actor_name, invitation_id, metadata, created_at
)
select
  'invitation:' || invitation.id::text || ':revoked',
  invitation.organization_id,
  invitation.join_request_id,
  'invitation_revoked',
  invitation.revoked_by,
  coalesce(nullif(btrim(invitation.revoked_by_name), ''), 'Gestor'),
  invitation.id,
  '{}'::jsonb,
  invitation.revoked_at
from public.organization_invitations as invitation
where invitation.join_request_id is not null
  and invitation.revoked_at is not null
on conflict (event_key) do nothing;

insert into public.organization_join_request_events (
  event_key, organization_id, request_id, event_type, actor_id, actor_name, invitation_id, metadata, created_at
)
select
  'invitation:' || invitation.id::text || ':accepted',
  invitation.organization_id,
  invitation.join_request_id,
  'invitation_accepted',
  invitation.accepted_by,
  coalesce(
    nullif(btrim(profile.full_name), ''),
    nullif(btrim(profile.email), ''),
    'Profissional'
  ),
  invitation.id,
  '{}'::jsonb,
  invitation.accepted_at
from public.organization_invitations as invitation
left join public.profiles as profile on profile.id = invitation.accepted_by
where invitation.join_request_id is not null
  and invitation.accepted_at is not null
on conflict (event_key) do nothing;

insert into public.organization_join_request_events (
  event_key, organization_id, request_id, event_type, actor_name, invitation_id, metadata, created_at
)
select
  format(
    'invitation:%s:email:%s:%s',
    invitation.id,
    invitation.email_delivery_status,
    invitation.email_delivery_updated_at::text
  ),
  invitation.organization_id,
  invitation.join_request_id,
  'invitation_email_status',
  'Sistema de e-mail',
  invitation.id,
  jsonb_build_object('status', invitation.email_delivery_status),
  coalesce(invitation.email_delivery_updated_at, invitation.created_at)
from public.organization_invitations as invitation
where invitation.join_request_id is not null
  and invitation.email_delivery_status is not null
on conflict (event_key) do nothing;

create or replace function public.link_organization_join_request_invitation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.join_request_id is not null
     or new.email is null
     or new.professional_id is null then
    return new;
  end if;

  select request.id
    into new.join_request_id
    from public.organization_join_requests as request
   where request.organization_id = new.organization_id
     and request.professional_id = new.professional_id
     and lower(coalesce(request.applicant_email, '')) = lower(new.email)
     and request.status = 'approved'
   order by request.reviewed_at desc nulls last, request.requested_at desc
   limit 1;

  return new;
end;
$$;
revoke all on function public.link_organization_join_request_invitation() from public, anon, authenticated;

create or replace function public.record_organization_join_request_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  event_type_value text;
  event_key_value text;
  actor_id_value uuid;
  actor_name_value text;
  event_time_value timestamptz;
  event_metadata_value jsonb;
begin
  if tg_op = 'INSERT' then
    event_type_value := 'request_submitted';
    event_key_value := 'request:' || new.id::text || ':submitted';
    actor_id_value := new.user_id;
    actor_name_value := new.applicant_name;
    event_time_value := new.requested_at;
    event_metadata_value := '{}'::jsonb;
  elsif old.status is distinct from new.status then
    event_type_value := case
      when new.status = 'approved' then 'request_approved'
      when new.status = 'rejected' then 'request_rejected'
      when new.status = 'pending' then 'request_reopened'
      else null
    end;

    if event_type_value is null then
      return new;
    end if;

    actor_id_value := coalesce(auth.uid(), new.reviewed_by);
    event_time_value := coalesce(new.reviewed_at, clock_timestamp());
    event_key_value := format(
      'request:%s:%s:%s',
      new.id,
      event_type_value,
      event_time_value::text
    );
    event_metadata_value := jsonb_strip_nulls(jsonb_build_object(
      'previous_status', old.status,
      'new_status', new.status,
      'professional_id', new.professional_id
    ));

    if actor_id_value is not null then
      select coalesce(
        nullif(btrim(profile.full_name), ''),
        nullif(btrim(profile.email), ''),
        'Usuário'
      )
        into actor_name_value
        from public.profiles as profile
       where profile.id = actor_id_value;
    end if;
    actor_name_value := coalesce(actor_name_value, 'Sistema');
  else
    return new;
  end if;

  insert into public.organization_join_request_events (
    event_key, organization_id, request_id, event_type, actor_id, actor_name, metadata, created_at
  )
  values (
    event_key_value,
    new.organization_id,
    new.id,
    event_type_value,
    actor_id_value,
    actor_name_value,
    event_metadata_value,
    event_time_value
  )
  on conflict (event_key) do nothing;

  return new;
end;
$$;
revoke all on function public.record_organization_join_request_event() from public, anon, authenticated;

create or replace function public.record_organization_join_request_invitation_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  event_type_value text;
  event_key_value text;
  actor_id_value uuid;
  actor_name_value text;
  event_time_value timestamptz;
  event_metadata_value jsonb;
begin
  if new.join_request_id is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    event_type_value := 'invitation_created';
    event_key_value := 'invitation:' || new.id::text || ':created';
    actor_id_value := new.invited_by;
    actor_name_value := coalesce(nullif(btrim(new.invited_by_name), ''), 'Gestor');
    event_time_value := new.created_at;
    event_metadata_value := '{}'::jsonb;
  elsif old.email_delivery_status is distinct from new.email_delivery_status
        and new.email_delivery_status is not null then
    event_type_value := 'invitation_email_status';
    event_key_value := format(
      'invitation:%s:email:%s:%s',
      new.id,
      new.email_delivery_status,
      coalesce(new.email_delivery_updated_at, clock_timestamp())::text
    );
    actor_name_value := 'Sistema de e-mail';
    event_time_value := coalesce(new.email_delivery_updated_at, clock_timestamp());
    event_metadata_value := jsonb_build_object('status', new.email_delivery_status);
  elsif old.revoked_at is null and new.revoked_at is not null then
    event_type_value := 'invitation_revoked';
    event_key_value := 'invitation:' || new.id::text || ':revoked';
    actor_id_value := new.revoked_by;
    actor_name_value := coalesce(nullif(btrim(new.revoked_by_name), ''), 'Gestor');
    event_time_value := new.revoked_at;
    event_metadata_value := '{}'::jsonb;
  elsif old.accepted_at is null and new.accepted_at is not null then
    event_type_value := 'invitation_accepted';
    event_key_value := 'invitation:' || new.id::text || ':accepted';
    actor_id_value := new.accepted_by;
    event_time_value := new.accepted_at;
    event_metadata_value := '{}'::jsonb;
    if actor_id_value is not null then
      select coalesce(
        nullif(btrim(profile.full_name), ''),
        nullif(btrim(profile.email), ''),
        'Profissional'
      )
        into actor_name_value
        from public.profiles as profile
       where profile.id = actor_id_value;
    end if;
    actor_name_value := coalesce(actor_name_value, 'Profissional');
  else
    return new;
  end if;

  insert into public.organization_join_request_events (
    event_key,
    organization_id,
    request_id,
    event_type,
    actor_id,
    actor_name,
    invitation_id,
    metadata,
    created_at
  )
  values (
    event_key_value,
    new.organization_id,
    new.join_request_id,
    event_type_value,
    actor_id_value,
    actor_name_value,
    new.id,
    event_metadata_value,
    event_time_value
  )
  on conflict (event_key) do nothing;

  return new;
end;
$$;
revoke all on function public.record_organization_join_request_invitation_event() from public, anon, authenticated;

drop trigger if exists organization_invitations_link_join_request on public.organization_invitations;
create trigger organization_invitations_link_join_request
before insert or update on public.organization_invitations
for each row execute function public.link_organization_join_request_invitation();

drop trigger if exists organization_join_requests_record_history on public.organization_join_requests;
create trigger organization_join_requests_record_history
after insert or update of status on public.organization_join_requests
for each row execute function public.record_organization_join_request_event();

drop trigger if exists organization_invitations_record_join_request_history on public.organization_invitations;
create trigger organization_invitations_record_join_request_history
after insert or update on public.organization_invitations
for each row execute function public.record_organization_join_request_invitation_event();

alter table public.organization_join_request_events enable row level security;
revoke all on table public.organization_join_request_events from public, anon, authenticated;
grant select on table public.organization_join_request_events to authenticated;
drop policy if exists organization_join_request_events_select_manager
  on public.organization_join_request_events;
create policy organization_join_request_events_select_manager
  on public.organization_join_request_events
  for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_manager()
  );

insert into public.schema_metadata (key, value)
values ('app_schema_version', '2026-10-21.3')
on conflict (key) do update
  set value = excluded.value, updated_at = now();

commit;
