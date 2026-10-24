begin;

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
    or (
      email is null
      and phone is not null
      and phone ~ '^\+[1-9][0-9]{7,14}$'
    )
  );

create index if not exists invitations_phone_idx
  on public.organization_invitations (phone, created_at desc)
  where phone is not null;

create table if not exists public.organization_join_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
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

create unique index if not exists organization_join_requests_one_pending_idx
  on public.organization_join_requests (organization_id, user_id)
  where status = 'pending';
create index if not exists organization_join_requests_organization_status_idx
  on public.organization_join_requests (organization_id, status, requested_at desc);

create or replace function public.get_onboarding_options()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  organization_count integer;
  has_membership boolean;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select exists (
    select 1
      from public.organization_members
     where user_id = auth.uid()
       and is_active
  ) into has_membership;
  select count(*) into organization_count from public.organizations;

  return jsonb_build_object(
    'can_create_organization', not has_membership and organization_count = 0,
    'can_request_access', not has_membership and organization_count = 1
  );
end;
$$;

create or replace function public.request_organization_join()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_organization_id uuid;
  organization_count integer;
  applicant_name text;
  applicant_email text;
  applicant_phone text;
  join_request_id uuid;
  join_request public.organization_join_requests;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if exists (
    select 1
      from public.organization_members
     where user_id = auth.uid()
       and is_active
  ) then
    raise exception 'account already belongs to an organization';
  end if;

  select count(*) into organization_count from public.organizations;
  if organization_count <> 1 then
    raise exception 'there must be exactly one organization to request access';
  end if;
  select id into target_organization_id from public.organizations limit 1;

  select
    coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), nullif(btrim(p.full_name), '')),
    case when u.email_confirmed_at is not null then lower(nullif(btrim(u.email), '')) end,
    case when u.phone_confirmed_at is not null then nullif(btrim(u.phone), '') end
    into applicant_name, applicant_email, applicant_phone
    from auth.users u
    left join public.profiles p on p.id = u.id
   where u.id = auth.uid();

  if applicant_name is null then
    raise exception 'complete your name before requesting access';
  end if;
  if applicant_email is null and applicant_phone is null then
    raise exception 'confirm your email or phone before requesting access';
  end if;
  if exists (
    select 1
      from public.organization_invitations i
     where i.organization_id = target_organization_id
       and i.accepted_at is null
       and i.revoked_at is null
       and i.expires_at > now()
       and (
         (applicant_email is not null and lower(i.email) = applicant_email)
         or (applicant_phone is not null and i.phone = applicant_phone)
       )
  ) then
    raise exception 'use the pending invitation for this account';
  end if;

  insert into public.organization_join_requests (
    organization_id, user_id, applicant_name, applicant_email, applicant_phone
  ) values (
    target_organization_id, auth.uid(), applicant_name, applicant_email, applicant_phone
  )
  on conflict (organization_id, user_id) where status = 'pending'
  do nothing
  returning id into join_request_id;

  if join_request_id is null then
    select id into join_request_id
      from public.organization_join_requests
     where organization_id = target_organization_id
       and user_id = auth.uid()
       and status = 'pending';
  end if;

  select * into join_request
    from public.organization_join_requests
   where id = join_request_id;

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
         select 1
           from public.organization_members m
          where m.organization_id = p.organization_id
            and m.professional_id = p.id
            and m.is_active
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
  if exists (
    select 1
      from public.organization_members
     where user_id = join_request.user_id
       and is_active
  ) then
    raise exception 'applicant already belongs to an organization';
  end if;
  if exists (
    select 1
      from public.organization_members
     where organization_id = join_request.organization_id
       and professional_id = professional.id
       and is_active
  ) then
    raise exception 'professional profile is already linked to an account';
  end if;

  insert into public.organization_members (organization_id, user_id, role, professional_id)
  values (join_request.organization_id, join_request.user_id, professional.role, professional.id);

  perform set_config('barber_manager.allow_context_update', 'on', true);
  update public.profiles
     set default_organization_id = join_request.organization_id,
         updated_at = now()
   where id = join_request.user_id;

  update public.organization_join_requests
     set status = 'approved',
         professional_id = professional.id,
         reviewed_at = now(),
         reviewed_by = auth.uid()
   where id = join_request.id;

  return jsonb_build_object(
    'organization_id', join_request.organization_id,
    'user_id', join_request.user_id,
    'professional_id', professional.id,
    'role', professional.role
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
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
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
  insert into public.organization_settings (organization_id, payload) values (new_organization_id, '{}'::jsonb);
  return new_organization_id;
end;
$$;

alter table public.organization_join_requests enable row level security;
revoke all on table public.organization_join_requests from public, anon, authenticated;
grant select on table public.organization_join_requests to authenticated;
drop policy if exists organization_join_requests_select_visible on public.organization_join_requests;
create policy organization_join_requests_select_visible on public.organization_join_requests
for select to authenticated using (
  user_id = auth.uid()
  or (organization_id = public.current_organization_id() and public.is_manager())
);

revoke all on function public.get_onboarding_options() from public, anon, authenticated;
grant execute on function public.get_onboarding_options() to authenticated;
revoke all on function public.request_organization_join() from public, anon, authenticated;
grant execute on function public.request_organization_join() to authenticated;
revoke all on function public.list_organization_join_request_candidates() from public, anon, authenticated;
grant execute on function public.list_organization_join_request_candidates() to authenticated;
revoke all on function public.approve_organization_join_request(uuid, text) from public, anon, authenticated;
grant execute on function public.approve_organization_join_request(uuid, text) to authenticated;
revoke all on function public.reject_organization_join_request(uuid) from public, anon, authenticated;
grant execute on function public.reject_organization_join_request(uuid) to authenticated;
revoke all on function public.bootstrap_organization(text, text, text) from public, anon, authenticated;
grant execute on function public.bootstrap_organization(text, text, text) to authenticated;

insert into public.schema_metadata (key, value)
values ('app_schema_version', '2026-10-14.3')
on conflict (key) do update
  set value = excluded.value, updated_at = now();

commit;
