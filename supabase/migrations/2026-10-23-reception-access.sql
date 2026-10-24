begin;

alter table public.organization_invitations
  drop constraint if exists organization_invitations_role_check;

alter table public.organization_members
  drop constraint if exists organization_members_role_check;

create or replace function public.default_role_permissions(target_role text)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case target_role
    when 'gestor' then '["dashboard","agenda","controle","clientes","profissionais","vendas","produtos","planos","financeiro","comunicacao","configuracoes"]'::jsonb
    when 'dev-admin' then '["dashboard","agenda","controle","clientes","profissionais","vendas","produtos","planos","financeiro","comunicacao","configuracoes"]'::jsonb
    when 'recepcao' then '["dashboard","agenda","controle","clientes","produtos","planos","comunicacao"]'::jsonb
    when 'barbeiro' then '["dashboard","agenda","controle"]'::jsonb
    when 'manicure' then '["dashboard","agenda","controle"]'::jsonb
    when 'vendedor' then '["dashboard","agenda","clientes","vendas"]'::jsonb
    else '["dashboard"]'::jsonb
  end;
$$;

update public.organization_settings settings
   set payload = jsonb_set(
     coalesce(settings.payload, '{}'::jsonb),
     '{roles}',
     coalesce((
       select jsonb_agg(
         case when role_entry.value->>'key' = 'recepcao' then
           jsonb_set(
             jsonb_set(
               role_entry.value,
               '{permissions}',
               '["dashboard","agenda","controle","clientes","produtos","planos","comunicacao"]'::jsonb,
               true
             ),
             '{description}',
             to_jsonb('Acesso operacional sem Financeiro, Equipe ou Configurações; não é um perfil profissional.'::text),
             true
           )
         else role_entry.value end
       )
       from jsonb_array_elements(
         case when jsonb_typeof(settings.payload->'roles') = 'array'
           then settings.payload->'roles' else '[]'::jsonb end
       ) as role_entry(value)
     ), '[]'::jsonb)
     ||
     case when exists (
       select 1
         from jsonb_array_elements(
           case when jsonb_typeof(settings.payload->'roles') = 'array'
             then settings.payload->'roles' else '[]'::jsonb end
         ) as role_entry(value)
        where role_entry.value->>'key' = 'recepcao'
     ) then '[]'::jsonb
     else jsonb_build_array(jsonb_build_object(
       'id', 'role-recepcao',
       'key', 'recepcao',
       'label', 'Recepcionista',
       'description', 'Acesso operacional sem Financeiro, Equipe ou Configurações; não é um perfil profissional.',
       'isActive', true,
       'permissions', '["dashboard","agenda","controle","clientes","produtos","planos","comunicacao"]'::jsonb
     )) end,
     true
   );

create or replace function public.has_permission(permission_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  role_key text;
  configured_permissions jsonb;
begin
  if auth.uid() is null or permission_key is null or btrim(permission_key) = '' then
    return false;
  end if;
  role_key := public.current_user_role();
  if public.is_manager() then
    return true;
  end if;
  if role_key = 'recepcao'
     and permission_key in ('financeiro', 'profissionais', 'configuracoes') then
    return false;
  end if;

  select role_item->'permissions'
    into configured_permissions
    from public.organization_settings settings
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(settings.payload->'roles') = 'array'
        then settings.payload->'roles' else '[]'::jsonb end
    ) role_item
   where settings.organization_id = public.current_organization_id()
     and role_item->>'key' = role_key
   limit 1;

  if configured_permissions is null or jsonb_typeof(configured_permissions) <> 'array' then
    configured_permissions := public.default_role_permissions(role_key);
  end if;
  return configured_permissions ? permission_key;
end;
$$;

create or replace function public.create_reception_invitation(
  p_email text,
  p_expires_in_days integer default 7
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation_token text;
  normalized_email text;
  invitation_id uuid;
  invitation_expires_at timestamptz;
begin
  if auth.uid() is null or not public.is_manager() then
    raise exception 'only managers can create invitations';
  end if;
  normalized_email := lower(btrim(coalesce(p_email, '')));
  if normalized_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'valid email is required';
  end if;
  if p_expires_in_days is null or p_expires_in_days < 1 or p_expires_in_days > 30 then
    raise exception 'invitation expiry must be between 1 and 30 days';
  end if;

  update public.organization_invitations
     set revoked_at = now()
   where organization_id = public.current_organization_id()
     and lower(email) = normalized_email
     and accepted_at is null
     and revoked_at is null;

  invitation_token := encode(extensions.gen_random_bytes(32), 'hex');
  invitation_expires_at := now() + make_interval(days => p_expires_in_days);
  insert into public.organization_invitations (
    organization_id, email, professional_id, role, token_hash, expires_at, invited_by
  )
  values (
    public.current_organization_id(), normalized_email, null, 'recepcao',
    encode(extensions.digest(invitation_token, 'sha256'), 'hex'),
    invitation_expires_at, auth.uid()
  )
  returning id into invitation_id;

  return jsonb_build_object(
    'id', invitation_id,
    'token', invitation_token,
    'email', normalized_email,
    'professional_id', null,
    'role', 'recepcao',
    'expires_at', invitation_expires_at
  );
end;
$$;
revoke all on function public.create_reception_invitation(text, integer) from public, anon, authenticated;
grant execute on function public.create_reception_invitation(text, integer) to authenticated;

create or replace function public.get_public_organization_invitation_info(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation record;
  invitation_status text;
  organization_name text;
  professional_name text;
begin
  if nullif(btrim(coalesce(p_token, '')), '') is null then
    return jsonb_build_object('valid', false, 'status', 'invalid', 'channel', null);
  end if;

  select i.id, i.organization_id, i.professional_id, i.role, i.revoked_at,
         i.accepted_at, i.expires_at, i.phone, i.email
    into invitation
    from public.organization_invitations i
   where i.token_hash = encode(extensions.digest(btrim(p_token), 'sha256'), 'hex')
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
  if invitation_status = 'valid' then
    select o.name into organization_name
      from public.organizations o
     where o.id = invitation.organization_id;
    if invitation.professional_id is not null then
      select p.name into professional_name
        from public.professionals p
       where p.id = invitation.professional_id
         and p.organization_id = invitation.organization_id;
    elsif invitation.role = 'recepcao' then
      professional_name := 'Recepção';
    end if;
  end if;

  return jsonb_build_object(
    'valid', invitation_status = 'valid',
    'status', invitation_status,
    'channel', case when invitation.phone is not null then 'phone' else 'email' end,
    'email', case when invitation_status = 'valid' and invitation.phone is null then invitation.email else null end,
    'organization_name', case when invitation_status = 'valid' then organization_name else null end,
    'professional_name', case when invitation_status = 'valid' then professional_name else null end
  );
end;
$$;
revoke all on function public.get_public_organization_invitation_info(text) from public, anon, authenticated;
grant execute on function public.get_public_organization_invitation_info(text) to anon, authenticated;

drop policy if exists professionals_select_member on public.professionals;
create policy professionals_select_member on public.professionals
for select to authenticated using (
  organization_id = public.current_organization_id()
  and (
    public.is_manager()
    or id = public.current_professional_id()
    or public.has_permission('profissionais')
    or (
      public.current_user_role() = 'recepcao'
      and (public.has_permission('agenda') or public.has_permission('controle'))
    )
  )
);

drop policy if exists products_select_member on public.products;
create policy products_select_member on public.products
for select to authenticated using (
  organization_id = public.current_organization_id()
  and (
    public.has_permission('produtos')
    or (public.current_user_role() = 'recepcao' and public.has_permission('controle'))
  )
);

do $$
declare
  policy_name text;
  table_name text;
  command_name text;
  policy_command text;
  policy_roles_condition text;
begin
  foreach table_name in array array['appointments', 'blocks'] loop
    foreach command_name in array array['select', 'insert', 'update', 'delete'] loop
      policy_name := table_name || '_' || case command_name
        when 'select' then 'select_member'
        when 'insert' then 'write_member'
        when 'update' then 'update_member'
        else 'delete_member'
      end;
      execute format('drop policy if exists %I on public.%I', policy_name, table_name);

      policy_command := case command_name
        when 'select' then 'for select'
        when 'insert' then 'for insert'
        when 'update' then 'for update'
        else 'for delete'
      end;
      policy_roles_condition :=
        'organization_id = public.current_organization_id() ' ||
        'and public.is_current_organization_professional(professional_id) ' ||
        'and (public.is_manager() or ((public.has_permission(''agenda'') or public.has_permission(''controle'')) ' ||
        'and (public.current_user_role() = ''recepcao'' or professional_id = public.current_professional_id())))';

      if command_name = 'insert' then
        execute format(
          'create policy %I on public.%I %s to authenticated with check (%s)',
          policy_name, table_name, policy_command, policy_roles_condition
        );
      elsif command_name = 'update' then
        execute format(
          'create policy %I on public.%I %s to authenticated using (%s) with check (%s)',
          policy_name, table_name, policy_command, policy_roles_condition, policy_roles_condition
        );
      else
        execute format(
          'create policy %I on public.%I %s to authenticated using (%s)',
          policy_name, table_name, policy_command, policy_roles_condition
        );
      end if;
    end loop;
  end loop;
end;
$$;

drop policy if exists subscribers_select_member on public.subscribers;
create policy subscribers_select_member on public.subscribers
for select to authenticated using (
  organization_id = public.current_organization_id()
  and public.is_current_organization_professional(professional_id)
  and public.is_current_organization_plan(plan_id)
  and (
    public.is_manager()
    or (
      public.has_permission('planos')
      and (
        professional_id = public.current_professional_id()
        or public.current_user_role() = 'recepcao'
      )
    )
  )
);

drop policy if exists subscribers_write on public.subscribers;
create policy subscribers_write on public.subscribers
for all to authenticated using (
  organization_id = public.current_organization_id()
  and public.is_current_organization_professional(professional_id)
  and public.is_current_organization_plan(plan_id)
  and (
    public.is_manager()
    or (
      public.has_permission('planos')
      and (
        professional_id = public.current_professional_id()
        or public.current_user_role() = 'recepcao'
      )
    )
  )
) with check (
  organization_id = public.current_organization_id()
  and public.is_current_organization_professional(professional_id)
  and public.is_current_organization_plan(plan_id)
  and (
    public.is_manager()
    or (
      public.has_permission('planos')
      and (
        professional_id = public.current_professional_id()
        or public.current_user_role() = 'recepcao'
      )
    )
  )
);

drop policy if exists subscription_payments_select_member on public.subscription_payments;
create policy subscription_payments_select_member on public.subscription_payments
for select to authenticated using (
  organization_id = public.current_organization_id()
  and exists (
    select 1
      from public.subscribers s
      join public.subscription_plans p on p.id = s.plan_id
     where s.id = subscription_payments.subscriber_id
       and s.organization_id = subscription_payments.organization_id
       and public.is_current_organization_professional(s.professional_id)
       and public.is_current_organization_plan(p.id)
       and (
         public.is_manager()
         or (
           public.has_permission('planos')
           and (s.professional_id = public.current_professional_id() or public.current_user_role() = 'recepcao')
         )
       )
  )
);

drop policy if exists subscription_payments_write on public.subscription_payments;
create policy subscription_payments_write on public.subscription_payments
for all to authenticated using (
  organization_id = public.current_organization_id()
  and exists (
    select 1
      from public.subscribers s
      join public.subscription_plans p on p.id = s.plan_id
     where s.id = subscription_payments.subscriber_id
       and s.organization_id = subscription_payments.organization_id
       and public.is_current_organization_professional(s.professional_id)
       and public.is_current_organization_plan(p.id)
       and (
         public.is_manager()
         or (
           public.has_permission('planos')
           and (s.professional_id = public.current_professional_id() or public.current_user_role() = 'recepcao')
         )
       )
  )
) with check (
  organization_id = public.current_organization_id()
  and exists (
    select 1
      from public.subscribers s
      join public.subscription_plans p on p.id = s.plan_id
     where s.id = subscription_payments.subscriber_id
       and s.organization_id = subscription_payments.organization_id
       and public.is_current_organization_professional(s.professional_id)
       and public.is_current_organization_plan(p.id)
       and (
         public.is_manager()
         or (
           public.has_permission('planos')
           and (s.professional_id = public.current_professional_id() or public.current_user_role() = 'recepcao')
         )
       )
  )
);

create or replace function public.set_subscription_payment_status(
  p_subscriber_id text,
  p_due_date text,
  p_status text,
  p_paid_at text default null,
  p_amount double precision default 0,
  p_payment_method text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_sub public.subscribers;
  plan_duration text;
  plan_price double precision;
  payment_row public.subscription_payments;
  next_payment_row public.subscription_payments;
  next_due text;
begin
  if p_status not in ('pago', 'pendente', 'vencido') then
    raise exception 'invalid subscription payment status';
  end if;
  if p_amount < 0 then
    raise exception 'payment amount must be non-negative';
  end if;
  if p_status = 'pago' and (p_paid_at is null or p_payment_method not in ('debito', 'credito', 'pix', 'dinheiro')) then
    raise exception 'paid subscriptions require payment date and method';
  end if;

  select * into current_sub
    from public.subscribers
   where id = p_subscriber_id
     and organization_id = public.current_organization_id()
   for update;
  if current_sub.id is null then raise exception 'subscriber not found'; end if;

  if not (
    public.is_manager()
    or (
      public.has_permission('planos')
      and (
        current_sub.professional_id = public.current_professional_id()
        or public.current_user_role() = 'recepcao'
      )
    )
  ) then
    raise exception 'user does not have permission to update subscription payments';
  end if;

  select duration, price into plan_duration, plan_price
    from public.subscription_plans
   where id = current_sub.plan_id
     and organization_id = current_sub.organization_id;
  if plan_duration is null then raise exception 'subscription plan not found'; end if;

  insert into public.subscription_payments (
    subscriber_id, due_date, paid_at, amount, payment_method, status, note, organization_id
  )
  values (
    current_sub.id,
    coalesce(nullif(p_due_date, ''), current_sub.next_payment),
    case when p_status = 'pago' then p_paid_at else null end,
    p_amount,
    case when p_status = 'pago' then p_payment_method else null end,
    p_status,
    nullif(btrim(coalesce(p_note, '')), ''),
    current_sub.organization_id
  )
  on conflict (subscriber_id, due_date) do update set
    paid_at = excluded.paid_at,
    amount = excluded.amount,
    payment_method = excluded.payment_method,
    status = excluded.status,
    note = excluded.note
  returning * into payment_row;

  if p_status = 'pago' then
    if current_sub.next_payment = payment_row.due_date then
      next_due := public.subscription_next_due(payment_row.due_date, plan_duration);
      update public.subscribers
         set next_payment = next_due, status = 'ativo'
       where id = current_sub.id;
    else
      next_due := current_sub.next_payment;
    end if;

    insert into public.subscription_payments (
      subscriber_id, due_date, amount, status, organization_id
    )
    values (
      current_sub.id, next_due, coalesce(plan_price, 0), 'pendente', current_sub.organization_id
    )
    on conflict (subscriber_id, due_date) do nothing;

    select * into next_payment_row
      from public.subscription_payments
     where subscriber_id = current_sub.id
       and due_date = next_due
       and organization_id = current_sub.organization_id;
  else
    update public.subscribers
       set status = p_status
     where id = current_sub.id;
  end if;

  return jsonb_build_object(
    'payment', to_jsonb(payment_row),
    'subscriber', to_jsonb((select s from public.subscribers s where s.id = current_sub.id)),
    'next_payment', case when next_payment_row.id is null then null else to_jsonb(next_payment_row) end
  );
end;
$$;

insert into public.schema_metadata (key, value)
values ('app_schema_version', '2026-10-23.3')
on conflict (key) do update
set value = excluded.value, updated_at = now();

commit;
