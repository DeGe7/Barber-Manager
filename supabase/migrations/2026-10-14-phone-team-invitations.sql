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
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if exists (
    select 1
      from public.organization_members
     where user_id = auth.uid()
       and is_active
  ) then
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

  if nullif(btrim(p_name), '') is null then
    raise exception 'organization name is required';
  end if;

  insert into public.organizations (name, cnpj, address)
  values (btrim(p_name), coalesce(p_cnpj, ''), coalesce(p_address, ''))
  returning id into new_organization_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (new_organization_id, auth.uid(), 'gestor');

  perform set_config('barber_manager.allow_context_update', 'on', true);
  update public.profiles
     set default_organization_id = new_organization_id,
         updated_at = now()
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

  if invitation_role is null then
    raise exception 'active professional not found';
  end if;

  if exists (
    select 1
      from public.organization_members
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
    organization_id,
    email,
    phone,
    professional_id,
    role,
    token_hash,
    expires_at,
    invited_by
  )
  values (
    public.current_organization_id(),
    null,
    normalized_phone,
    p_professional_id,
    invitation_role,
    encode(extensions.digest(invitation_token, 'sha256'), 'hex'),
    invitation_expires_at,
    auth.uid()
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
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if nullif(btrim(coalesce(p_token, '')), '') is null then
    raise exception 'invitation token is required';
  end if;

  select *
    into invitation
    from public.organization_invitations
   where token_hash = encode(extensions.digest(btrim(p_token), 'sha256'), 'hex')
   for update;

  if invitation.id is null then
    raise exception 'invitation not found or invalid';
  end if;
  if invitation.revoked_at is not null then
    raise exception 'invitation was revoked';
  end if;
  if invitation.accepted_at is not null then
    raise exception 'invitation was already used';
  end if;
  if invitation.expires_at <= now() then
    raise exception 'invitation has expired';
  end if;

  select lower(email), phone, phone_confirmed_at is not null
    into current_email, current_phone, current_phone_confirmed
    from auth.users
   where id = auth.uid();

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
    select 1
      from public.organization_members
     where organization_id = invitation.organization_id
       and user_id = auth.uid()
       and is_active
  ) then
    raise exception 'you already belong to this organization';
  end if;

  if exists (
    select 1
      from public.organization_members
     where user_id = auth.uid()
       and organization_id <> invitation.organization_id
       and is_active
  ) then
    raise exception 'your account already belongs to another organization';
  end if;

  if exists (
    select 1
      from public.organization_members
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
     set default_organization_id = invitation.organization_id,
         updated_at = now()
   where id = auth.uid();

  update public.organization_invitations
     set accepted_at = now(),
         accepted_by = auth.uid()
   where id = invitation.id;

  return jsonb_build_object(
    'organization_id', invitation.organization_id,
    'role', invitation.role,
    'professional_id', invitation.professional_id
  );
end;
$$;

revoke all on function public.create_organization_invitation_by_phone(text, text, integer) from public, anon;
grant execute on function public.create_organization_invitation_by_phone(text, text, integer) to authenticated;
grant execute on function public.bootstrap_organization(text, text, text) to authenticated;
grant execute on function public.accept_organization_invitation(text) to authenticated;

commit;
