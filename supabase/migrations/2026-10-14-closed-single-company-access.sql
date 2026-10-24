begin;

-- Phone invitations are included here so the migration is self-contained even
-- when the earlier phone-invitation migration was not applied to an E2E project.
alter table public.organization_invitations
  alter column email drop not null,
  add column if not exists phone text;

alter table public.organization_invitations
  drop constraint if exists organization_invitations_email_check;
alter table public.organization_invitations
  drop constraint if exists organization_invitations_contact_check;
alter table public.organization_invitations
  add constraint organization_invitations_contact_check check (
    (email is not null and btrim(email) <> '' and phone is null)
    or (email is null and phone is not null and phone ~ '^\+[1-9][0-9]{7,14}$')
  );

create index if not exists invitations_phone_idx
  on public.organization_invitations (phone, created_at desc)
  where phone is not null;

create table if not exists public.organization_join_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  applicant_name text not null check (btrim(applicant_name) <> ''),
  applicant_email text,
  applicant_phone text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  professional_id text references public.professionals(id) on delete set null,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete restrict,
  check (
    (applicant_email is not null and btrim(applicant_email) <> '')
    or (applicant_phone is not null and btrim(applicant_phone) <> '')
  ),
  check (
    status <> 'pending'
    or (professional_id is null and reviewed_at is null and reviewed_by is null)
  )
);

alter table public.organization_join_requests
  alter column user_id drop not null;
alter table public.organization_join_requests
  drop constraint if exists organization_join_requests_user_id_fkey;
alter table public.organization_join_requests
  add constraint organization_join_requests_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete set null;

create index if not exists organization_join_requests_organization_status_idx
  on public.organization_join_requests (organization_id, status, requested_at desc);

-- Keep a short-lived, hashed requester key so changing contact details cannot
-- bypass the public request limit. Raw network addresses are never persisted.
create table if not exists public.organization_join_request_rate_limits (
  requester_hash text primary key check (requester_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0)
);
create index if not exists organization_join_request_rate_limits_window_idx
  on public.organization_join_request_rate_limits (window_started_at);

-- This flag is a server-side deployment control. Client roles cannot read or
-- change it; only the service role can temporarily enable E2E provisioning.
create table if not exists public.deployment_settings (
  setting_key text primary key check (setting_key = 'organization_creation_enabled'),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.deployment_settings (setting_key, enabled)
values ('organization_creation_enabled', false)
on conflict (setting_key) do update
  set enabled = false,
      updated_at = now();
alter table public.deployment_settings enable row level security;
revoke all on table public.deployment_settings from public, anon, authenticated;
grant select, update on table public.deployment_settings to service_role;

create or replace function public.get_onboarding_options()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  organization_count integer;
  has_membership boolean;
  creation_enabled boolean;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  select exists (
    select 1 from public.organization_members
     where user_id = auth.uid() and is_active
  ) into has_membership;
  select count(*) into organization_count from public.organizations;
  select coalesce((
    select enabled
      from public.deployment_settings
     where setting_key = 'organization_creation_enabled'
  ), false) into creation_enabled;

  return jsonb_build_object(
    'can_create_organization', not has_membership
      and organization_count = 0
      and creation_enabled,
    'can_request_access', not has_membership and organization_count = 1
  );
end;
$$;

drop function if exists public.request_organization_join();
create or replace function public.request_organization_join(
  p_applicant_name text,
  p_applicant_email text default null,
  p_applicant_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_organization_id uuid;
  organization_count integer;
  normalized_name text;
  normalized_email text;
  normalized_phone text;
  contact_key text;
  request_headers jsonb;
  requester_identity text;
  requester_key_hash text;
  request_limit integer;
  requests_in_window integer;
  window_started_at timestamptz;
  retry_after_seconds integer;
  join_request public.organization_join_requests;
begin
  if exists (
    select 1 from public.organization_members
     where user_id = auth.uid() and is_active
  ) then
    raise exception 'account already belongs to an organization';
  end if;

  normalized_name := btrim(coalesce(p_applicant_name, ''));
  normalized_email := lower(nullif(btrim(coalesce(p_applicant_email, '')), ''));
  normalized_phone := nullif(btrim(coalesce(p_applicant_phone, '')), '');

  if length(normalized_name) < 2 or length(normalized_name) > 100 then
    raise exception 'applicant name must be between 2 and 100 characters';
  end if;
  if (normalized_email is null) = (normalized_phone is null) then
    raise exception 'provide exactly one contact method';
  end if;
  if normalized_email is not null
     and normalized_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'valid email is required';
  end if;
  if normalized_phone is not null
     and normalized_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'valid E.164 phone is required';
  end if;

  select count(*) into organization_count from public.organizations;
  if organization_count <> 1 then
    raise exception 'there must be exactly one organization to request access';
  end if;
  select id into target_organization_id from public.organizations limit 1;

  if exists (
    select 1 from public.organization_invitations i
     where i.organization_id = target_organization_id
       and i.accepted_at is null
       and i.revoked_at is null
       and i.expires_at > now()
       and (
         (normalized_email is not null and lower(i.email) = normalized_email)
         or (normalized_phone is not null and i.phone = normalized_phone)
       )
  ) then
    raise exception 'use the pending invitation for this contact';
  end if;

  if exists (
    select 1 from public.organization_join_requests
     where organization_id = target_organization_id
       and status = 'approved'
       and (
         (normalized_email is not null and lower(applicant_email) = normalized_email)
         or (normalized_phone is not null and applicant_phone = normalized_phone)
       )
  ) then
    raise exception 'this contact already has an approved access request';
  end if;

  contact_key := coalesce(normalized_email, normalized_phone);
  perform pg_advisory_xact_lock(
    hashtextextended(target_organization_id::text || ':' || contact_key, 0)
  );

  select * into join_request
    from public.organization_join_requests
   where organization_id = target_organization_id
     and status = 'pending'
     and (
       (normalized_email is not null and lower(applicant_email) = normalized_email)
       or (normalized_phone is not null and applicant_phone = normalized_phone)
     )
   order by requested_at desc
   limit 1;

  if join_request.id is null then
    if (
      select count(*)
        from public.organization_join_requests
       where organization_id = target_organization_id
         and requested_at > now() - interval '1 hour'
         and (
           (normalized_email is not null and lower(applicant_email) = normalized_email)
           or (normalized_phone is not null and applicant_phone = normalized_phone)
         )
    ) >= 3 then
      raise exception 'too many access requests for this contact';
    end if;

    request_headers := coalesce(
      nullif(current_setting('request.headers', true), '')::jsonb,
      '{}'::jsonb
    );
    requester_identity := coalesce(
      nullif(btrim(request_headers ->> 'cf-connecting-ip'), ''),
      nullif(btrim(request_headers ->> 'x-real-ip'), ''),
      nullif(
        btrim(reverse(split_part(reverse(coalesce(request_headers ->> 'x-forwarded-for', '')), ',', 1))),
        ''
      ),
      'name:' || lower(regexp_replace(normalized_name, '\s+', ' ', 'g'))
    );
    request_limit := case
      when requester_identity like 'name:%' then 3
      else 10
    end;
    requester_key_hash := encode(
      extensions.digest(
        target_organization_id::text || ':' || requester_identity,
        'sha256'
      ),
      'hex'
    );

    -- Expired keys are removed as new requests arrive; only active hourly
    -- windows remain in this table.
    delete from public.organization_join_request_rate_limits as expired_limit
     where expired_limit.window_started_at <= now() - interval '1 hour';

    insert into public.organization_join_request_rate_limits as current_limit (
      requester_hash, window_started_at, request_count
    ) values (
      requester_key_hash, now(), 1
    )
    on conflict (requester_hash) do update
       set window_started_at = case
             when current_limit.window_started_at <= now() - interval '1 hour' then now()
             else current_limit.window_started_at
           end,
           request_count = case
             when current_limit.window_started_at <= now() - interval '1 hour' then 1
             else least(current_limit.request_count + 1, request_limit + 1)
           end
    returning current_limit.request_count, current_limit.window_started_at
         into requests_in_window, window_started_at;

    if requests_in_window > request_limit then
      retry_after_seconds := greatest(
        1,
        ceil(extract(epoch from window_started_at + interval '1 hour' - now()))::integer
      );
      return jsonb_build_object(
        'rate_limited', true,
        'retry_after_seconds', retry_after_seconds
      );
    end if;

    insert into public.organization_join_requests (
      organization_id, user_id, applicant_name, applicant_email, applicant_phone
    ) values (
      target_organization_id, auth.uid(), normalized_name, normalized_email, normalized_phone
    )
    returning * into join_request;
  end if;

  return jsonb_build_object(
    'id', join_request.id,
    'applicant_name', join_request.applicant_name,
    'applicant_email', join_request.applicant_email,
    'applicant_phone', join_request.applicant_phone,
    'status', join_request.status,
    'professional_id', join_request.professional_id,
    'requested_at', join_request.requested_at,
    'reviewed_at', join_request.reviewed_at
  );
end;
$$;

create or replace function public.list_organization_join_request_candidates()
returns table (id text, name text, role text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_manager() then
    raise exception 'only managers can review access requests';
  end if;

  return query
    select p.id, p.name, p.role
      from public.professionals p
     where p.organization_id = public.current_organization_id()
       and p.is_active
       and not exists (
         select 1 from public.organization_members m
          where m.organization_id = p.organization_id
            and m.professional_id = p.id
            and m.is_active
       )
       and not exists (
         select 1 from public.organization_join_requests r
          where r.organization_id = p.organization_id
            and r.professional_id = p.id
            and r.status = 'approved'
       )
     order by p.name;
end;
$$;

create or replace function public.approve_organization_join_request(
  p_request_id uuid,
  p_professional_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  join_request public.organization_join_requests;
  professional public.professionals;
begin
  if auth.uid() is null or not public.is_manager() then
    raise exception 'only managers can approve access requests';
  end if;

  select * into join_request
    from public.organization_join_requests
   where id = p_request_id
     and organization_id = public.current_organization_id()
     and status = 'pending'
   for update;
  if join_request.id is null then
    raise exception 'pending access request not found';
  end if;

  select * into professional
    from public.professionals
   where id = p_professional_id
     and organization_id = join_request.organization_id
     and is_active
   for update;
  if professional.id is null then
    raise exception 'active professional profile not found';
  end if;
  if join_request.user_id is not null and exists (
    select 1 from public.organization_members
     where user_id = join_request.user_id and is_active
  ) then
    raise exception 'applicant already belongs to an organization';
  end if;
  if exists (
    select 1 from public.organization_members
     where organization_id = join_request.organization_id
       and professional_id = professional.id
       and is_active
  ) or exists (
    select 1 from public.organization_join_requests
     where organization_id = join_request.organization_id
       and professional_id = professional.id
       and status = 'approved'
       and id <> join_request.id
  ) then
    raise exception 'professional profile is already linked or reserved';
  end if;

  update public.organization_join_requests
     set status = 'approved',
         professional_id = professional.id,
         reviewed_at = now(),
         reviewed_by = auth.uid()
   where id = join_request.id;

  return jsonb_build_object(
    'organization_id', join_request.organization_id,
    'professional_id', professional.id,
    'role', professional.role,
    'status', 'approved'
  );
end;
$$;

create or replace function public.reject_organization_join_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_manager() then
    raise exception 'only managers can reject access requests';
  end if;

  update public.organization_join_requests
     set status = 'rejected',
         reviewed_at = now(),
         reviewed_by = auth.uid()
   where id = p_request_id
     and organization_id = public.current_organization_id()
     and status = 'pending';
  if not found then
    raise exception 'pending access request not found';
  end if;
end;
$$;

create or replace function public.bootstrap_organization(
  p_name text,
  p_cnpj text default '',
  p_address text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_organization_id uuid;
  creation_enabled boolean;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  select coalesce((
    select enabled
      from public.deployment_settings
     where setting_key = 'organization_creation_enabled'
  ), false) into creation_enabled;
  if not creation_enabled then
    raise exception 'organization creation is disabled for this deployment';
  end if;

  lock table public.organizations in exclusive mode;
  if exists (select 1 from public.organization_members where user_id = auth.uid() and is_active) then
    raise exception 'user already belongs to an organization';
  end if;
  if exists (
    select 1
      from auth.users u
      join public.organization_invitations i
        on (
          (i.email is not null and lower(i.email) = lower(coalesce(u.email, '')))
          or (i.phone is not null and i.phone = u.phone)
        )
     where u.id = auth.uid()
       and i.accepted_at is null
       and i.revoked_at is null
       and i.expires_at > now()
  ) then
    raise exception 'accept your pending invitation before creating an organization';
  end if;
  if exists (select 1 from public.organizations) then
    raise exception 'this application already has an organization';
  end if;
  if nullif(btrim(p_name), '') is null then raise exception 'organization name is required'; end if;

  insert into public.organizations (name, cnpj, address)
  values (btrim(p_name), coalesce(p_cnpj, ''), coalesce(p_address, ''))
  returning id into new_organization_id;
  insert into public.organization_members (organization_id, user_id, role)
  values (new_organization_id, auth.uid(), 'gestor');
  perform set_config('barber_manager.allow_context_update', 'on', true);
  update public.profiles
     set default_organization_id = new_organization_id, updated_at = now()
   where id = auth.uid();
  insert into public.organization_settings (organization_id, payload)
  values (new_organization_id, '{}'::jsonb);
  return new_organization_id;
end;
$$;

create or replace function public.create_organization_invitation_by_phone(
  p_professional_id text,
  p_phone text,
  p_expires_in_days integer default 7
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation_token text;
  normalized_phone text;
  invitation_role text;
  invitation_id uuid;
  invitation_expires_at timestamptz;
begin
  if auth.uid() is null or not public.is_manager() then
    raise exception 'only managers can create invitations';
  end if;
  normalized_phone := btrim(coalesce(p_phone, ''));
  if normalized_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'valid E.164 phone is required';
  end if;
  if p_expires_in_days is null or p_expires_in_days < 1 or p_expires_in_days > 30 then
    raise exception 'invitation expiry must be between 1 and 30 days';
  end if;

  select case when role = 'gestor' then 'gestor' else role end
    into invitation_role
    from public.professionals
   where id = p_professional_id
     and organization_id = public.current_organization_id()
     and is_active;
  if invitation_role is null then raise exception 'active professional not found'; end if;
  if exists (
    select 1 from public.organization_members
     where organization_id = public.current_organization_id()
       and professional_id = p_professional_id
       and is_active
  ) then
    raise exception 'professional is already linked to an account';
  end if;

  update public.organization_invitations
     set revoked_at = now()
   where organization_id = public.current_organization_id()
     and phone = normalized_phone
     and accepted_at is null
     and revoked_at is null;

  invitation_token := encode(extensions.gen_random_bytes(32), 'hex');
  invitation_expires_at := now() + make_interval(days => p_expires_in_days);
  insert into public.organization_invitations (
    organization_id, email, phone, professional_id, role, token_hash, expires_at, invited_by
  ) values (
    public.current_organization_id(), null, normalized_phone, p_professional_id,
    invitation_role, encode(extensions.digest(invitation_token, 'sha256'), 'hex'),
    invitation_expires_at, auth.uid()
  )
  returning id into invitation_id;

  return jsonb_build_object(
    'id', invitation_id,
    'token', invitation_token,
    'email', null,
    'phone', normalized_phone,
    'professional_id', p_professional_id,
    'role', invitation_role,
    'expires_at', invitation_expires_at
  );
end;
$$;

create or replace function public.accept_organization_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation public.organization_invitations;
  current_email text;
  current_phone text;
  current_phone_confirmed boolean;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if nullif(btrim(coalesce(p_token, '')), '') is null then
    raise exception 'invitation token is required';
  end if;

  select * into invitation
    from public.organization_invitations
   where token_hash = encode(extensions.digest(btrim(p_token), 'sha256'), 'hex')
   for update;
  if invitation.id is null then raise exception 'invitation not found or invalid'; end if;
  if invitation.revoked_at is not null then raise exception 'invitation was revoked'; end if;
  if invitation.accepted_at is not null then raise exception 'invitation was already used'; end if;
  if invitation.expires_at <= now() then raise exception 'invitation has expired'; end if;

  select lower(email), phone, phone_confirmed_at is not null
    into current_email, current_phone, current_phone_confirmed
    from auth.users where id = auth.uid();
  if invitation.phone is not null then
    if current_phone is null or current_phone_confirmed is not true then
      raise exception 'invitation phone not confirmed';
    end if;
    if current_phone <> invitation.phone then
      raise exception 'this invitation belongs to another phone';
    end if;
  elsif current_email is null or current_email <> lower(invitation.email) then
    raise exception 'this invitation belongs to another email';
  end if;

  if exists (
    select 1 from public.organization_members
     where organization_id = invitation.organization_id
       and user_id = auth.uid()
       and is_active
  ) then
    raise exception 'you already belong to this organization';
  end if;
  if exists (
    select 1 from public.organization_members
     where user_id = auth.uid()
       and organization_id <> invitation.organization_id
       and is_active
  ) then
    raise exception 'your account already belongs to another organization';
  end if;
  if exists (
    select 1 from public.organization_members
     where organization_id = invitation.organization_id
       and professional_id = invitation.professional_id
       and is_active
  ) then
    raise exception 'professional is already linked to another account';
  end if;

  insert into public.organization_members (organization_id, user_id, role, professional_id)
  values (invitation.organization_id, auth.uid(), invitation.role, invitation.professional_id);
  perform set_config('barber_manager.allow_context_update', 'on', true);
  update public.profiles
     set default_organization_id = invitation.organization_id, updated_at = now()
   where id = auth.uid();
  update public.organization_invitations
     set accepted_at = now(), accepted_by = auth.uid()
   where id = invitation.id;

  update public.organization_join_requests
     set user_id = auth.uid()
   where organization_id = invitation.organization_id
     and status = 'approved'
     and professional_id = invitation.professional_id
     and user_id is null
     and (
       (invitation.email is not null and lower(applicant_email) = lower(invitation.email))
       or (invitation.phone is not null and applicant_phone = invitation.phone)
     );

  return jsonb_build_object(
    'organization_id', invitation.organization_id,
    'role', invitation.role,
    'professional_id', invitation.professional_id
  );
end;
$$;

create or replace function public.get_public_organization_invitation_info(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation public.organization_invitations;
  invitation_status text;
begin
  if nullif(btrim(coalesce(p_token, '')), '') is null then
    return jsonb_build_object('valid', false, 'status', 'invalid', 'channel', null);
  end if;

  select * into invitation
    from public.organization_invitations
   where token_hash = encode(extensions.digest(btrim(p_token), 'sha256'), 'hex')
   limit 1;
  if invitation.id is null then
    return jsonb_build_object('valid', false, 'status', 'invalid', 'channel', null);
  end if;

  invitation_status := case
    when invitation.revoked_at is not null then 'revoked'
    when invitation.accepted_at is not null then 'used'
    when invitation.expires_at <= now() then 'expired'
    else 'valid'
  end;
  return jsonb_build_object(
    'valid', invitation_status = 'valid',
    'status', invitation_status,
    'channel', case when invitation.phone is not null then 'phone' else 'email' end
  );
end;
$$;

alter table public.organization_join_requests enable row level security;
revoke all on table public.organization_join_requests from public, anon, authenticated;
grant select on table public.organization_join_requests to authenticated;
alter table public.organization_join_request_rate_limits enable row level security;
revoke all on table public.organization_join_request_rate_limits from public, anon, authenticated;
drop policy if exists organization_join_requests_select_visible on public.organization_join_requests;
create policy organization_join_requests_select_visible on public.organization_join_requests
for select to authenticated using (
  user_id = auth.uid()
  or (organization_id = public.current_organization_id() and public.is_manager())
);

revoke all on function public.bootstrap_organization(text, text, text) from public, anon, authenticated;
grant execute on function public.bootstrap_organization(text, text, text) to authenticated;
revoke all on function public.get_onboarding_options() from public, anon, authenticated;
grant execute on function public.get_onboarding_options() to authenticated;
revoke all on function public.request_organization_join(text, text, text) from public, anon, authenticated;
grant execute on function public.request_organization_join(text, text, text) to anon, authenticated;
revoke all on function public.get_public_organization_invitation_info(text) from public, anon, authenticated;
grant execute on function public.get_public_organization_invitation_info(text) to anon, authenticated;
revoke all on function public.list_organization_join_request_candidates() from public, anon, authenticated;
grant execute on function public.list_organization_join_request_candidates() to authenticated;
revoke all on function public.approve_organization_join_request(uuid, text) from public, anon, authenticated;
grant execute on function public.approve_organization_join_request(uuid, text) to authenticated;
revoke all on function public.reject_organization_join_request(uuid) from public, anon, authenticated;
grant execute on function public.reject_organization_join_request(uuid) to authenticated;
revoke all on function public.create_organization_invitation_by_phone(text, text, integer) from public, anon, authenticated;
grant execute on function public.create_organization_invitation_by_phone(text, text, integer) to authenticated;
revoke all on function public.accept_organization_invitation(text) from public, anon, authenticated;
grant execute on function public.accept_organization_invitation(text) to authenticated;

insert into public.schema_metadata (key, value)
values ('app_schema_version', '2026-10-14.4')
on conflict (key) do update
  set value = excluded.value, updated_at = now();

commit;
