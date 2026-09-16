 -- Barber Manager — Supabase source of truth
 -- Execute this script once in the Supabase SQL Editor.
 -- It replaces the temporary Replit/Drizzle model with a tenant-safe model.

 create extension if not exists "pgcrypto";

 -- Updated only after the complete source schema has been applied.
 create table if not exists public.schema_metadata (
   key text primary key,
   value text not null,
   updated_at timestamptz not null default now()
 );

 -- ============================================================================
 -- Identity and tenancy
 -- ============================================================================

 create table if not exists public.organizations (
   id uuid primary key default gen_random_uuid(),
   name text not null check (btrim(name) <> ''),
   cnpj text not null default '',
   address text not null default '',
   logo_url text,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now()
 );

 create table if not exists public.profiles (
   id uuid primary key references auth.users(id) on delete cascade,
   email text not null default '',
   full_name text not null default 'Usuário',
   avatar_url text,
   default_organization_id uuid references public.organizations(id) on delete set null,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now()
 );

 create table if not exists public.professionals (
   id text primary key default gen_random_uuid()::text,
   name text not null,
   role text not null default 'barbeiro'
     check (role in ('barbeiro', 'manicure', 'vendedor', 'gestor')),
   initials text not null default '',
   color text not null default '#3b82f6',
   is_active boolean not null default true,
   commissions jsonb not null default '{}'::jsonb,
   organization_id uuid not null references public.organizations(id) on delete cascade,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now()
 );

 create table if not exists public.organization_members (
   organization_id uuid not null references public.organizations(id) on delete cascade,
   user_id uuid not null references public.profiles(id) on delete cascade,
   role text not null check (role in ('gestor', 'dev-admin', 'barbeiro', 'manicure', 'vendedor')),
   professional_id text references public.professionals(id) on delete set null,
   is_active boolean not null default true,
   created_at timestamptz not null default now(),
   primary key (organization_id, user_id)
 );

 create table if not exists public.organization_invitations (
   id uuid primary key default gen_random_uuid(),
   organization_id uuid not null references public.organizations(id) on delete cascade,
   email text not null check (btrim(email) <> ''),
   professional_id text not null references public.professionals(id) on delete cascade,
   role text not null check (role in ('gestor', 'barbeiro', 'manicure', 'vendedor')),
   token_hash text not null unique,
   expires_at timestamptz not null,
   accepted_at timestamptz,
   accepted_by uuid references public.profiles(id) on delete set null,
   revoked_at timestamptz,
   invited_by uuid not null references public.profiles(id) on delete restrict,
   created_at timestamptz not null default now(),
   check (accepted_at is null or revoked_at is null)
 );

 create index if not exists professionals_organization_idx
   on public.professionals (organization_id, is_active);
 create index if not exists members_user_idx
   on public.organization_members (user_id, is_active);
 create index if not exists invitations_organization_status_idx
   on public.organization_invitations (organization_id, created_at desc);
 create index if not exists invitations_email_idx
   on public.organization_invitations (lower(email), created_at desc);

 create table if not exists public.communication_sends (
   id uuid primary key default gen_random_uuid(),
   organization_id uuid not null references public.organizations(id) on delete cascade,
   channel text not null check (channel in ('whatsapp', 'email')),
   kind text not null check (kind in ('campaign', 'invitation')),
   campaign_id text,
   campaign_label text,
   recipient_id text,
   recipient_name text not null check (btrim(recipient_name) <> ''),
   recipient_address text not null check (btrim(recipient_address) <> ''),
   message text not null check (btrim(message) <> ''),
   status text not null check (status in ('initiated', 'failed')),
   failure_reason text,
   consented_at timestamptz not null default now(),
   sent_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
   created_at timestamptz not null default now()
 );

 create index if not exists communication_sends_organization_created_idx
   on public.communication_sends (organization_id, created_at desc);
 create index if not exists communication_sends_recipient_idx
   on public.communication_sends (organization_id, recipient_id, created_at desc);

 do $$
 declare
   table_name text;
 begin
   foreach table_name in array array['professionals', 'organization_members', 'organization_invitations'] loop
     execute format('alter table public.%I drop constraint if exists %I', table_name, table_name || '_role_check');
     execute format('alter table public.%I drop constraint if exists %I', table_name, table_name || '_role_not_blank');
     execute format('alter table public.%I add constraint %I check (btrim(role) <> '''')', table_name, table_name || '_role_not_blank');
   end loop;
 end;
 $$;

 create or replace function public.current_organization_id()
 returns uuid
 language sql
 stable
 security definer
 set search_path = public
 as $$
   select coalesce(
     (select default_organization_id from public.profiles where id = auth.uid()),
     (select organization_id
        from public.organization_members
       where user_id = auth.uid() and is_active
       order by created_at
       limit 1)
   );
 $$;

 create or replace function public.current_user_role()
 returns text
 language sql
 stable
 security definer
 set search_path = public
 as $$
   select role
     from public.organization_members
    where user_id = auth.uid()
      and organization_id = public.current_organization_id()
      and is_active
    limit 1;
 $$;

 create or replace function public.current_professional_id()
 returns text
 language sql
 stable
 security definer
 set search_path = public
 as $$
   select professional_id
     from public.organization_members
    where user_id = auth.uid()
      and organization_id = public.current_organization_id()
      and is_active
      and (
        professional_id is null
        or exists (
          select 1
            from public.professionals
           where professionals.id = organization_members.professional_id
             and professionals.organization_id = organization_members.organization_id
        )
      )
    limit 1;
 $$;

 create or replace function public.is_current_organization_professional(target_professional_id text)
 returns boolean
 language sql
 stable
 security definer
 set search_path = public
 as $$
   select target_professional_id is not null
     and exists (
       select 1
         from public.professionals
        where id = target_professional_id
          and organization_id = public.current_organization_id()
     );
 $$;

 create or replace function public.is_manager()
 returns boolean
 language sql
 stable
 security definer
 set search_path = public
 as $$
   select public.current_user_role() = any(array['gestor', 'dev-admin']);
 $$;

 create or replace function public.has_any_role(allowed_roles text[])
 returns boolean
 language sql
 stable
 security definer
 set search_path = public
 as $$
   select public.current_user_role() = any(allowed_roles);
 $$;

 -- ============================================================================
 -- Business data
 -- ============================================================================

 create table if not exists public.organization_settings (
   organization_id uuid primary key references public.organizations(id) on delete cascade,
   payload jsonb not null default '{}'::jsonb,
   updated_at timestamptz not null default now()
 );

 create table if not exists public.appointments (
   id text primary key default gen_random_uuid()::text,
   date text not null,
   time text not null,
   client text not null,
   client_phone text,
   professional_id text not null references public.professionals(id) on delete restrict,
   service text not null,
   duration integer not null default 30 check (duration > 0),
   status text not null default 'pending'
     check (status in ('confirmed', 'pending', 'checked_in', 'completed', 'no_show', 'cancelled')),
   checked_in_at text,
   completed_at text,
   value double precision not null default 0 check (value >= 0),
   tip double precision not null default 0 check (tip >= 0),
   products jsonb not null default '[]'::jsonb,
   pay_method text not null default 'pix',
   payment_splits jsonb not null default '[]'::jsonb,
   notes text,
   organization_id uuid not null references public.organizations(id) on delete cascade,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now()
 );

 create table if not exists public.blocks (
   id text primary key default gen_random_uuid()::text,
   date text not null,
   professional_id text not null references public.professionals(id) on delete restrict,
   slots jsonb not null default '[]'::jsonb,
   reason text not null default '',
   notes text,
   organization_id uuid not null references public.organizations(id) on delete cascade,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now()
 );

 create table if not exists public.clients (
   id text primary key default gen_random_uuid()::text,
   name text not null,
   email text not null default '',
   whatsapp text not null default '',
   birthday text,
   source text,
   source_other text,
   interest text not null default 'barbearia'
     check (interest in ('barbearia', 'salao', 'protese')),
   created_at timestamptz not null default now(),
   visits jsonb not null default '[]'::jsonb,
   organization_id uuid not null references public.organizations(id) on delete cascade,
   updated_at timestamptz not null default now()
 );

 create table if not exists public.products (
   id text primary key default gen_random_uuid()::text,
   name text not null,
   category text not null default '',
   price double precision not null default 0 check (price >= 0),
   cost double precision not null default 0 check (cost >= 0),
   stock integer not null default 0 check (stock >= 0),
   min_stock integer not null default 0 check (min_stock >= 0),
   is_active boolean not null default true,
   organization_id uuid not null references public.organizations(id) on delete cascade,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now()
 );

 create table if not exists public.expenses (
   id text primary key default gen_random_uuid()::text,
   date text not null,
   description text not null,
   amount double precision not null default 0 check (amount >= 0),
   category text not null default 'Outros',
   payment_method text check (payment_method in ('debito', 'credito', 'pix', 'dinheiro')),
   organization_id uuid not null references public.organizations(id) on delete cascade,
   created_at timestamptz not null default now()
 );

 alter table public.expenses
   add column if not exists payment_method text;

 do $$
 begin
   if not exists (
     select 1
     from pg_constraint
     where conname = 'expenses_payment_method_check'
       and conrelid = 'public.expenses'::regclass
   ) then
     alter table public.expenses
       add constraint expenses_payment_method_check
       check (payment_method in ('debito', 'credito', 'pix', 'dinheiro'));
   end if;
 end $$;

 create table if not exists public.incomes (
   id text primary key default gen_random_uuid()::text,
   date text not null,
   description text not null,
   amount double precision not null default 0 check (amount >= 0),
   organization_id uuid not null references public.organizations(id) on delete cascade,
   created_at timestamptz not null default now()
 );

  create table if not exists public.finance_entry_changes (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    entry_type text not null check (entry_type in ('income', 'expense')),
    entry_id text not null,
    changed_by uuid references auth.users(id) on delete set null,
    changed_by_name text not null default 'Usuário',
    changed_at timestamptz not null default now(),
    previous_values jsonb not null,
    new_values jsonb not null
  );

 create table if not exists public.prothesis_sales (
   id text primary key default gen_random_uuid()::text,
   date text not null,
   client text not null,
   whatsapp text,
   value double precision not null default 0 check (value >= 0),
   seller_id text not null references public.professionals(id) on delete restrict,
   installments integer not null default 1 check (installments > 0),
   installments_paid integer not null default 0 check (installments_paid >= 0 and installments_paid <= installments),
   pay_method1 text not null default 'pix',
   pay_amount1 double precision not null default 0 check (pay_amount1 >= 0),
   pay_method2 text,
   pay_amount2 double precision check (pay_amount2 is null or pay_amount2 >= 0),
   last_maintenance text,
   notes text,
   organization_id uuid not null references public.organizations(id) on delete cascade,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now()
 );

 create table if not exists public.mentoria_sessions (
   id text primary key default gen_random_uuid()::text,
   date text not null,
   client text not null,
   seller_id text not null references public.professionals(id) on delete restrict,
   value double precision not null default 0 check (value >= 0),
   duration_hours integer not null default 2 check (duration_hours > 0),
   status text not null default 'scheduled'
     check (status in ('scheduled', 'completed', 'cancelled')),
   notes text,
   organization_id uuid not null references public.organizations(id) on delete cascade,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now()
 );

 create table if not exists public.subscription_plans (
   id text primary key default gen_random_uuid()::text,
   name text not null,
   price double precision not null default 0 check (price >= 0),
   services jsonb not null default '[]'::jsonb,
   duration text not null default 'Mensal'
     check (duration in ('Mensal', 'Trimestral', 'Semestral', 'Anual')),
   organization_id uuid not null references public.organizations(id) on delete cascade,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now()
 );

 create table if not exists public.subscribers (
   id text primary key default gen_random_uuid()::text,
   name text not null,
   phone text not null default '',
   plan_id text not null references public.subscription_plans(id) on delete restrict,
   professional_id text not null references public.professionals(id) on delete restrict,
   start_date text not null,
   next_payment text not null,
   status text not null default 'ativo'
     check (status in ('ativo', 'vencido', 'pendente')),
   organization_id uuid not null references public.organizations(id) on delete cascade,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now()
 );

 create table if not exists public.subscription_payments (
   id text primary key default gen_random_uuid()::text,
   subscriber_id text not null references public.subscribers(id) on delete cascade,
   due_date text not null,
   paid_at text,
   amount double precision not null default 0 check (amount >= 0),
   payment_method text check (payment_method in ('debito', 'credito', 'pix', 'dinheiro')),
   status text not null default 'pendente'
     check (status in ('pago', 'pendente', 'vencido')),
   note text,
   organization_id uuid not null references public.organizations(id) on delete cascade,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now(),
   unique (subscriber_id, due_date)
 );

 insert into public.subscription_payments (subscriber_id, due_date, amount, status, organization_id)
 select s.id, s.next_payment, coalesce(p.price, 0),
        case when s.status = 'vencido' then 'vencido' else 'pendente' end,
        s.organization_id
   from public.subscribers s
   left join public.subscription_plans p on p.id = s.plan_id
  on conflict (subscriber_id, due_date) do nothing;

 create or replace function public.is_current_organization_plan(target_plan_id text)
 returns boolean
 language sql
 stable
 security definer
 set search_path = public
 as $$
   select target_plan_id is not null
     and exists (
       select 1
         from public.subscription_plans
        where id = target_plan_id
          and organization_id = public.current_organization_id()
     );
 $$;

 create or replace function public.default_role_permissions(target_role text)
 returns jsonb
 language sql
 immutable
  set search_path = public
 as $$
   select case target_role
     when 'gestor' then '["dashboard","agenda","controle","clientes","profissionais","vendas","produtos","planos","financeiro","comunicacao","configuracoes"]'::jsonb
     when 'dev-admin' then '["dashboard","agenda","controle","clientes","profissionais","vendas","produtos","planos","financeiro","comunicacao","configuracoes"]'::jsonb
     when 'barbeiro' then '["dashboard","agenda","controle"]'::jsonb
     when 'manicure' then '["dashboard","agenda","controle"]'::jsonb
     when 'vendedor' then '["dashboard","agenda","clientes","vendas"]'::jsonb
     else '["dashboard"]'::jsonb
   end;
 $$;

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
   if public.is_manager() then
     return true;
   end if;

   role_key := public.current_user_role();
   select role_item->'permissions'
     into configured_permissions
     from public.organization_settings settings
     cross join lateral jsonb_array_elements(coalesce(settings.payload->'roles', '[]'::jsonb)) role_item
    where settings.organization_id = public.current_organization_id()
      and role_item->>'key' = role_key
    limit 1;

   if configured_permissions is null or jsonb_typeof(configured_permissions) <> 'array' then
     configured_permissions := public.default_role_permissions(role_key);
   end if;
   return configured_permissions ? permission_key;
 end;
 $$;

 create index if not exists appointments_organization_date_idx on public.appointments (organization_id, date, time);
 create index if not exists blocks_organization_date_idx on public.blocks (organization_id, date);
 create index if not exists clients_organization_idx on public.clients (organization_id);
 create index if not exists products_organization_idx on public.products (organization_id, is_active);
 create index if not exists expenses_organization_date_idx on public.expenses (organization_id, date);
 create index if not exists incomes_organization_date_idx on public.incomes (organization_id, date);
  create index if not exists finance_entry_changes_organization_changed_idx
    on public.finance_entry_changes (organization_id, changed_at desc);
  create index if not exists finance_entry_changes_entry_idx
    on public.finance_entry_changes (organization_id, entry_type, entry_id, changed_at desc);
 create index if not exists prothesis_sales_organization_date_idx on public.prothesis_sales (organization_id, date);
 create index if not exists mentoria_organization_date_idx on public.mentoria_sessions (organization_id, date);
 create index if not exists plans_organization_idx on public.subscription_plans (organization_id);
 create index if not exists subscribers_organization_status_idx on public.subscribers (organization_id, status);
 create index if not exists subscription_payments_organization_due_idx
   on public.subscription_payments (organization_id, due_date desc);
 create index if not exists subscription_payments_subscriber_idx
   on public.subscription_payments (subscriber_id, due_date desc);

 -- ============================================================================
 -- Triggers and safe RPCs
 -- ============================================================================

 create or replace function public.set_updated_at()
 returns trigger
 language plpgsql
 set search_path = public
 as $$
 begin
   new.updated_at = now();
   return new;
 end;
 $$;

  create or replace function public.audit_finance_entry_update()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    actor_name text;
    changed_entry_type text;
    previous_entry_values jsonb;
    new_entry_values jsonb;
  begin
    if auth.uid() is null then
      raise exception 'financial changes require an authenticated actor';
    end if;

    select coalesce(nullif(btrim(full_name), ''), nullif(btrim(email), ''), 'Usuário')
      into actor_name
      from public.profiles
     where id = auth.uid();

    if TG_TABLE_NAME = 'incomes' then
      changed_entry_type := 'income';
      previous_entry_values := jsonb_build_object(
        'date', OLD.date,
        'description', OLD.description,
        'amount', OLD.amount
      );
      new_entry_values := jsonb_build_object(
        'date', NEW.date,
        'description', NEW.description,
        'amount', NEW.amount
      );
    elsif TG_TABLE_NAME = 'expenses' then
      changed_entry_type := 'expense';
      previous_entry_values := jsonb_build_object(
        'date', OLD.date,
        'description', OLD.description,
        'amount', OLD.amount,
         'category', OLD.category,
         'payment_method', OLD.payment_method
      );
      new_entry_values := jsonb_build_object(
        'date', NEW.date,
        'description', NEW.description,
        'amount', NEW.amount,
         'category', NEW.category,
         'payment_method', NEW.payment_method
      );
    else
      raise exception 'unsupported financial audit table: %', TG_TABLE_NAME;
    end if;

    insert into public.finance_entry_changes (
      organization_id,
      entry_type,
      entry_id,
      changed_by,
      changed_by_name,
      previous_values,
      new_values
    )
    values (
      OLD.organization_id,
      changed_entry_type,
      OLD.id,
      auth.uid(),
      coalesce(actor_name, 'Usuário'),
      previous_entry_values,
      new_entry_values
    );

    return NEW;
  end;
  $$;

  revoke all on function public.audit_finance_entry_update() from public;

  drop trigger if exists expenses_finance_audit on public.expenses;
  create trigger expenses_finance_audit
    after update on public.expenses
    for each row
    when (
      old.date is distinct from new.date
      or old.description is distinct from new.description
      or old.amount is distinct from new.amount
      or old.category is distinct from new.category
      or old.payment_method is distinct from new.payment_method
    )
    execute function public.audit_finance_entry_update();

  drop trigger if exists incomes_finance_audit on public.incomes;
  create trigger incomes_finance_audit
    after update on public.incomes
    for each row
    when (
      old.date is distinct from new.date
      or old.description is distinct from new.description
      or old.amount is distinct from new.amount
    )
    execute function public.audit_finance_entry_update();

 create or replace function public.subscription_next_due(base_date text, plan_duration text)
 returns text
 language plpgsql
 immutable
 set search_path = public
 as $$
 declare
   source_date date;
   target_month date;
   month_count integer;
   source_day integer;
   target_last_day integer;
 begin
   if base_date is null or base_date !~ '^\d{4}-\d{2}-\d{2}$' then
     raise exception 'invalid subscription base date';
   end if;
   source_date := base_date::date;
   month_count := case plan_duration
     when 'Trimestral' then 3
     when 'Semestral' then 6
     when 'Anual' then 12
     else 1
   end;
   -- Keep the original day when possible and clamp it to the target month's
   -- last day when the target month is shorter (for example, Jan 31 -> Feb 28).
   target_month := (date_trunc('month', source_date) + make_interval(months => month_count))::date;
   source_day := extract(day from source_date)::integer;
   target_last_day := extract(day from (date_trunc('month', target_month) + interval '1 month - 1 day'))::integer;
   return to_char(target_month + least(source_day, target_last_day) - 1, 'YYYY-MM-DD');
 end;
 $$;

 create or replace function public.subscription_payment_period_after_insert()
 returns trigger
 language plpgsql
 security definer
 set search_path = public
 as $$
 declare
   plan_price double precision;
 begin
   select price into plan_price
     from public.subscription_plans
    where id = new.plan_id
      and organization_id = new.organization_id;
   insert into public.subscription_payments (
     subscriber_id, due_date, amount, status, organization_id
   )
  values (
    new.id,
    new.next_payment,
    coalesce(plan_price, 0),
    case when new.status = 'vencido' then 'vencido' else 'pendente' end,
    new.organization_id
  )
   on conflict (subscriber_id, due_date) do nothing;
   return new;
 end;
 $$;

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
       and current_sub.professional_id = public.current_professional_id()
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
      -- A confirmation can be retried after the subscriber has already moved
      -- to the next cycle. In that case, keep the current cycle untouched and
      -- return the already-open pending cycle instead of advancing again.
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
        current_sub.id,
        next_due,
        coalesce(plan_price, 0),
        'pendente',
        current_sub.organization_id
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
     'next_payment', case when p_status = 'pago' then to_jsonb(next_payment_row) else null end
   );
 end;
 $$;

 create or replace function public.assign_current_organization()
 returns trigger
 language plpgsql
 security invoker
 set search_path = public
 as $$
 begin
   if new.organization_id is null then
     new.organization_id = public.current_organization_id();
   end if;
   if new.organization_id is null or new.organization_id <> public.current_organization_id() then
     raise exception 'organization_id does not belong to the current user';
   end if;
   return new;
 end;
 $$;

 create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path = public
 as $$
 declare
   resolved_name text;
 begin
   resolved_name := coalesce(
     nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
     nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
     nullif(btrim(split_part(coalesce(new.email, ''), '@', 1)), ''),
     'Usuário'
   );
   insert into public.profiles (id, email, full_name)
   values (new.id, coalesce(new.email, ''), resolved_name)
   on conflict (id) do update
     set email = excluded.email, full_name = excluded.full_name, updated_at = now();
   return new;
 end;
 $$;

 create or replace function public.sync_user_profile()
 returns trigger
 language plpgsql
 security definer
 set search_path = public
 as $$
 begin
   update public.profiles
      set email = coalesce(new.email, ''),
          full_name = coalesce(
            nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
            nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
            full_name
          ),
          updated_at = now()
    where id = new.id;
   return new;
 end;
 $$;

 drop trigger if exists auth_user_created on auth.users;
 create trigger auth_user_created
 after insert on auth.users
 for each row execute function public.handle_new_user();

 drop trigger if exists auth_user_profile_updated on auth.users;
 create trigger auth_user_profile_updated
 after update of email, raw_user_meta_data on auth.users
 for each row execute function public.sync_user_profile();

 drop trigger if exists subscribers_payment_period on public.subscribers;
 create trigger subscribers_payment_period
 after insert on public.subscribers
 for each row execute function public.subscription_payment_period_after_insert();

 do $$
 declare
   table_name text;
 begin
   foreach table_name in array array[
     'organizations', 'profiles', 'professionals', 'organization_settings',
     'appointments', 'blocks', 'clients', 'products', 'prothesis_sales',
     'mentoria_sessions', 'subscription_plans', 'subscribers',
     'subscription_payments'
   ] loop
     execute format('drop trigger if exists %I on public.%I', table_name || '_updated_at', table_name);
     execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', table_name || '_updated_at', table_name);
   end loop;
 end;
 $$;

 do $$
 declare
   table_name text;
 begin
   foreach table_name in array array[
     'professionals', 'organization_settings', 'appointments', 'blocks',
     'clients', 'products', 'expenses', 'incomes', 'prothesis_sales',
     'mentoria_sessions', 'subscription_plans', 'subscribers',
     'communication_sends'
   ] loop
     execute format('drop trigger if exists %I on public.%I', table_name || '_assign_organization', table_name);
     execute format('create trigger %I before insert or update on public.%I for each row execute function public.assign_current_organization()', table_name || '_assign_organization', table_name);
   end loop;
 end;
 $$;

 create or replace function public.bootstrap_organization(p_name text, p_cnpj text default '', p_address text default '')
 returns uuid
 language plpgsql
 security definer
 set search_path = public
 as $$
 declare
   new_organization_id uuid;
 begin
   if auth.uid() is null then raise exception 'authentication required'; end if;
   if exists (select 1 from public.organization_members where user_id = auth.uid() and is_active) then
     raise exception 'user already belongs to an organization';
   end if;
   if exists (
     select 1
       from public.organization_invitations
      where lower(email) = lower(coalesce((select email from auth.users where id = auth.uid()), ''))
        and accepted_at is null
        and revoked_at is null
        and expires_at > now()
   ) then
     raise exception 'accept your pending invitation before creating an organization';
   end if;
   if nullif(btrim(p_name), '') is null then raise exception 'organization name is required'; end if;
   insert into public.organizations (name, cnpj, address)
   values (btrim(p_name), coalesce(p_cnpj, ''), coalesce(p_address, ''))
   returning id into new_organization_id;
   insert into public.organization_members (organization_id, user_id, role)
   values (new_organization_id, auth.uid(), 'gestor');
   perform set_config('barber_manager.allow_context_update', 'on', true);
   update public.profiles set default_organization_id = new_organization_id, updated_at = now() where id = auth.uid();
   insert into public.organization_settings (organization_id, payload) values (new_organization_id, '{}'::jsonb);
   return new_organization_id;
 end;
 $$;

 create or replace function public.create_organization_invitation(
   p_professional_id text,
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
   invitation_role text;
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
   if p_expires_in_days < 1 or p_expires_in_days > 30 then
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
      and lower(email) = normalized_email
      and accepted_at is null
      and revoked_at is null;

  invitation_token := encode(extensions.gen_random_bytes(32), 'hex');
   invitation_expires_at := now() + make_interval(days => p_expires_in_days);
   insert into public.organization_invitations (
     organization_id, email, professional_id, role, token_hash, expires_at, invited_by
   )
   values (
     public.current_organization_id(), normalized_email, p_professional_id,
     invitation_role, encode(extensions.digest(invitation_token, 'sha256'), 'hex'),
     invitation_expires_at, auth.uid()
   )
   returning id into invitation_id;

   return jsonb_build_object(
     'id', invitation_id,
     'token', invitation_token,
     'email', normalized_email,
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

   select lower(email) into current_email from auth.users where id = auth.uid();
   if current_email is null or current_email <> lower(invitation.email) then
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

   return jsonb_build_object(
     'organization_id', invitation.organization_id,
     'role', invitation.role,
     'professional_id', invitation.professional_id
   );
 end;
 $$;

 create or replace function public.revoke_organization_invitation(p_invitation_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path = public
 as $$
 begin
   if auth.uid() is null or not public.is_manager() then
     raise exception 'only managers can revoke invitations';
   end if;
   update public.organization_invitations
      set revoked_at = now()
    where id = p_invitation_id
      and organization_id = public.current_organization_id()
      and accepted_at is null
      and revoked_at is null;
   if not found then
     raise exception 'pending invitation not found';
   end if;
 end;
 $$;

 create or replace function public.protect_profile_context()
 returns trigger
 language plpgsql
 security definer
 set search_path = public
 as $$
 begin
   if new.default_organization_id is distinct from old.default_organization_id
      and coalesce(current_setting('barber_manager.allow_context_update', true), 'off') <> 'on' then
      if new.default_organization_id is null
         and not exists (
           select 1
             from public.organizations
            where id = old.default_organization_id
         ) then
        return new;
      end if;
     raise exception 'default organization is managed by the invitation flow';
   end if;
   return new;
 end;
 $$;

 drop trigger if exists profiles_protect_context on public.profiles;
 create trigger profiles_protect_context
 before update on public.profiles
 for each row execute function public.protect_profile_context();

 create or replace function public.adjust_product_stock(p_product_id text, p_delta integer)
 returns public.products
 language plpgsql
 security definer
 set search_path = public
 as $$
 declare
   updated_product public.products;
 begin
   if auth.uid() is null or public.current_organization_id() is null then raise exception 'authentication required'; end if;
   if p_delta > 0 and not public.has_permission('produtos') then
     raise exception 'user does not have permission to restock products';
   end if;
   update public.products
      set stock = stock + p_delta, updated_at = now()
    where id = p_product_id
      and organization_id = public.current_organization_id()
      and stock + p_delta >= 0
   returning * into updated_product;
   if updated_product.id is null then raise exception 'insufficient stock or product not found'; end if;
   return updated_product;
 end;
 $$;

 create or replace function public.update_organization_details(
   p_name text,
   p_cnpj text default '',
   p_address text default '',
   p_logo_url text default null
 )
 returns public.organizations
 language plpgsql
 security definer
 set search_path = public
 as $$
 declare
   updated_organization public.organizations;
 begin
   if auth.uid() is null or not public.has_any_role(array['gestor', 'dev-admin']) then
     raise exception 'only managers can update organization details';
   end if;
   update public.organizations
      set name = coalesce(nullif(btrim(p_name), ''), name),
          cnpj = coalesce(p_cnpj, ''),
          address = coalesce(p_address, ''),
          logo_url = p_logo_url
    where id = public.current_organization_id()
   returning * into updated_organization;
   if updated_organization.id is null then raise exception 'organization not found'; end if;
   return updated_organization;
 end;
 $$;

 grant execute on function public.bootstrap_organization(text, text, text) to authenticated;
 grant execute on function public.create_organization_invitation(text, text, integer) to authenticated;
 grant execute on function public.accept_organization_invitation(text) to authenticated;
 grant execute on function public.revoke_organization_invitation(uuid) to authenticated;
 grant execute on function public.adjust_product_stock(text, integer) to authenticated;
 grant execute on function public.update_organization_details(text, text, text, text) to authenticated;
 grant execute on function public.set_subscription_payment_status(text, text, text, text, double precision, text, text) to authenticated;
 grant execute on function public.subscription_next_due(text, text) to authenticated;
 grant execute on function public.default_role_permissions(text) to authenticated;
 grant execute on function public.has_permission(text) to authenticated;
 revoke all on function public.is_current_organization_professional(text) from public;
 grant execute on function public.is_current_organization_professional(text) to authenticated;
 revoke all on function public.is_current_organization_plan(text) from public;
 grant execute on function public.is_current_organization_plan(text) to authenticated;
 revoke all on function public.default_role_permissions(text) from public;
 revoke all on function public.has_permission(text) from public;
 revoke all on function public.handle_new_user() from public;
 revoke all on function public.sync_user_profile() from public;

  -- SECURITY DEFINER functions must never be callable anonymously. Start from
  -- a closed default for every public function, then allow only the client
  -- RPCs used by the authenticated application and the service role.
  revoke execute on all functions in schema public from public;
  revoke execute on all functions in schema public from anon;
  revoke execute on all functions in schema public from authenticated;
  grant execute on all functions in schema public to service_role;
  grant execute on function public.bootstrap_organization(text, text, text) to authenticated;
  grant execute on function public.create_organization_invitation(text, text, integer) to authenticated;
  grant execute on function public.accept_organization_invitation(text) to authenticated;
  grant execute on function public.revoke_organization_invitation(uuid) to authenticated;
  grant execute on function public.adjust_product_stock(text, integer) to authenticated;
  grant execute on function public.update_organization_details(text, text, text, text) to authenticated;
  grant execute on function public.set_subscription_payment_status(text, text, text, text, double precision, text, text) to authenticated;
  grant execute on function public.subscription_next_due(text, text) to authenticated;
  grant execute on function public.default_role_permissions(text) to authenticated;
  grant execute on function public.has_permission(text) to authenticated;
  grant execute on function public.is_current_organization_professional(text) to authenticated;
  grant execute on function public.is_current_organization_plan(text) to authenticated;
  grant execute on function public.current_organization_id() to authenticated;
  grant execute on function public.current_user_role() to authenticated;
  grant execute on function public.current_professional_id() to authenticated;
  grant execute on function public.is_manager() to authenticated;
  grant execute on function public.has_any_role(text[]) to authenticated;

 -- ============================================================================
 -- Row Level Security
 -- ============================================================================

 alter table public.organizations enable row level security;
 alter table public.profiles enable row level security;
 alter table public.professionals enable row level security;
 alter table public.organization_members enable row level security;
 alter table public.organization_invitations enable row level security;
 alter table public.organization_settings enable row level security;
 alter table public.appointments enable row level security;
 alter table public.blocks enable row level security;
 alter table public.clients enable row level security;
 alter table public.products enable row level security;
 alter table public.expenses enable row level security;
 alter table public.incomes enable row level security;
  alter table public.finance_entry_changes enable row level security;
 alter table public.prothesis_sales enable row level security;
 alter table public.mentoria_sessions enable row level security;
 alter table public.subscription_plans enable row level security;
 alter table public.subscribers enable row level security;
 alter table public.subscription_payments enable row level security;
 alter table public.communication_sends enable row level security;

 -- Remove policies from the retired empresa_id model. Multiple permissive
 -- policies would otherwise weaken the tenant and professional boundaries.
 do $$
 declare
   table_name text;
 begin
   foreach table_name in array array[
     'professionals', 'organization_settings', 'appointments', 'blocks',
     'clients', 'products', 'expenses', 'incomes', 'prothesis_sales',
     'mentoria_sessions', 'subscription_plans', 'subscribers',
     'subscription_payments'
   ] loop
     execute format('drop policy if exists %I on public.%I', table_name || '_empresa_access', table_name);
   end loop;
 end;
 $$;

  -- Remove the legacy policy left by the old organization-settings model.
  -- Keeping it alongside the policies below would make PostgreSQL combine
  -- permissive predicates and could silently widen tenant access.
  drop policy if exists organization_settings_access on public.organization_settings;
  drop policy if exists organization_settings_empresa_access on public.organization_settings;

 drop policy if exists organizations_select_member on public.organizations;
 create policy organizations_select_member on public.organizations
 for select to authenticated using (id = public.current_organization_id());

 drop policy if exists profiles_select_own on public.profiles;
 create policy profiles_select_own on public.profiles
 for select to authenticated using (id = auth.uid());

 drop policy if exists profiles_update_own on public.profiles;
 create policy profiles_update_own on public.profiles
 for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

 drop policy if exists members_select_own on public.organization_members;
 create policy members_select_own on public.organization_members
 for select to authenticated using (
   user_id = auth.uid()
   or (organization_id = public.current_organization_id() and public.is_manager())
 );

 drop policy if exists invitations_select_manager on public.organization_invitations;
 create policy invitations_select_manager on public.organization_invitations
 for select to authenticated using (
   organization_id = public.current_organization_id() and public.is_manager()
 );

 drop policy if exists communication_sends_select_member on public.communication_sends;
 create policy communication_sends_select_member on public.communication_sends
 for select to authenticated using (
   organization_id = public.current_organization_id() and public.has_permission('comunicacao')
 );

 drop policy if exists communication_sends_insert_member on public.communication_sends;
 create policy communication_sends_insert_member on public.communication_sends
 for insert to authenticated with check (
   organization_id = public.current_organization_id()
   and public.has_permission('comunicacao')
   and sent_by = auth.uid()
 );

 drop policy if exists communication_sends_update_member on public.communication_sends;
 create policy communication_sends_update_member on public.communication_sends
 for update to authenticated
 using (
   organization_id = public.current_organization_id() and public.has_permission('comunicacao')
 )
 with check (
   organization_id = public.current_organization_id() and public.has_permission('comunicacao')
 );

 drop policy if exists settings_select_member on public.organization_settings;
 create policy settings_select_member on public.organization_settings
 for select to authenticated using (
   organization_id = public.current_organization_id()
 );

 do $$
 declare
   table_name text;
   permission_key text;
 begin
   foreach table_name in array array[
     'clients', 'products', 'expenses', 'incomes'
   ] loop
     permission_key := case
       when table_name = 'clients' then 'clientes'
       when table_name in ('expenses', 'incomes') then 'financeiro'
       else 'produtos'
     end;
     execute format('drop policy if exists %I on public.%I', table_name || '_select_member', table_name);
     execute format('create policy %I on public.%I for select to authenticated using (organization_id = public.current_organization_id() and public.has_permission(%L))', table_name || '_select_member', table_name, permission_key);
   end loop;
 end;
 $$;

 do $$
 declare
   table_name text;
 begin
   foreach table_name in array array['prothesis_sales', 'mentoria_sessions'] loop
     execute format('drop policy if exists %I on public.%I', table_name || '_select_member', table_name);
     execute format('drop policy if exists %I on public.%I', table_name || '_select', table_name);
     execute format(
       'create policy %I on public.%I for select to authenticated using (organization_id = public.current_organization_id() and public.is_current_organization_professional(seller_id) and (public.is_manager() or (public.has_permission(''vendas'') and seller_id = public.current_professional_id())))',
       table_name || '_select_member', table_name
     );
     execute format('drop policy if exists %I on public.%I', table_name || '_write', table_name);
     execute format(
       'create policy %I on public.%I for all to authenticated using (organization_id = public.current_organization_id() and public.is_current_organization_professional(seller_id) and (public.is_manager() or (public.has_permission(''vendas'') and seller_id = public.current_professional_id()))) with check (organization_id = public.current_organization_id() and public.is_current_organization_professional(seller_id) and (public.is_manager() or (public.has_permission(''vendas'') and seller_id = public.current_professional_id())))',
       table_name || '_write', table_name
     );
   end loop;
   drop policy if exists subscribers_select_member on public.subscribers;
   create policy subscribers_select_member on public.subscribers
   for select to authenticated using (
     organization_id = public.current_organization_id()
     and public.is_current_organization_professional(professional_id)
     and public.is_current_organization_plan(plan_id)
     and (public.is_manager() or (public.has_permission('planos') and professional_id = public.current_professional_id()))
   );
   drop policy if exists subscribers_write on public.subscribers;
   create policy subscribers_write on public.subscribers
   for all to authenticated using (
     organization_id = public.current_organization_id()
     and public.is_current_organization_professional(professional_id)
     and public.is_current_organization_plan(plan_id)
     and (public.is_manager() or (public.has_permission('planos') and professional_id = public.current_professional_id()))
   ) with check (
     organization_id = public.current_organization_id()
     and public.is_current_organization_professional(professional_id)
     and public.is_current_organization_plan(plan_id)
     and (public.is_manager() or (public.has_permission('planos') and professional_id = public.current_professional_id()))
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
         and (public.is_manager() or (public.has_permission('planos') and s.professional_id = public.current_professional_id()))
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
         and (public.is_manager() or (public.has_permission('planos') and s.professional_id = public.current_professional_id()))
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
         and (public.is_manager() or (public.has_permission('planos') and s.professional_id = public.current_professional_id()))
    )
  );
 end;
 $$;

  revoke insert, update, delete on table public.finance_entry_changes from anon, authenticated;
  grant select on table public.finance_entry_changes to authenticated;
  drop policy if exists finance_entry_changes_select_manager on public.finance_entry_changes;
  create policy finance_entry_changes_select_manager on public.finance_entry_changes
  for select to authenticated using (
    organization_id = public.current_organization_id()
    and public.is_manager()
  );

 drop policy if exists professionals_select_member on public.professionals;
 create policy professionals_select_member on public.professionals
 for select to authenticated using (
   organization_id = public.current_organization_id()
   and (public.is_manager() or id = public.current_professional_id() or public.has_permission('profissionais'))
 );

 do $$
 declare
   table_name text;
 begin
   foreach table_name in array array['appointments', 'blocks'] loop
     execute format('drop policy if exists %I on public.%I', table_name || '_select_member', table_name);
     execute format(
       'create policy %I on public.%I for select to authenticated using (organization_id = public.current_organization_id() and public.is_current_organization_professional(professional_id) and (public.is_manager() or ((public.has_permission(''agenda'') or public.has_permission(''controle'')) and professional_id = public.current_professional_id())))',
       table_name || '_select_member', table_name
     );
     execute format('drop policy if exists %I on public.%I', table_name || '_write_member', table_name);
     execute format(
       'create policy %I on public.%I for insert to authenticated with check (organization_id = public.current_organization_id() and public.is_current_organization_professional(professional_id) and (public.is_manager() or ((public.has_permission(''agenda'') or public.has_permission(''controle'')) and professional_id = public.current_professional_id())))',
       table_name || '_write_member', table_name
     );
     execute format('drop policy if exists %I on public.%I', table_name || '_update_member', table_name);
     execute format(
       'create policy %I on public.%I for update to authenticated using (organization_id = public.current_organization_id() and public.is_current_organization_professional(professional_id) and (public.is_manager() or ((public.has_permission(''agenda'') or public.has_permission(''controle'')) and professional_id = public.current_professional_id()))) with check (organization_id = public.current_organization_id() and public.is_current_organization_professional(professional_id) and (public.is_manager() or ((public.has_permission(''agenda'') or public.has_permission(''controle'')) and professional_id = public.current_professional_id())))',
       table_name || '_update_member', table_name
     );
     execute format('drop policy if exists %I on public.%I', table_name || '_delete_member', table_name);
     execute format(
       'create policy %I on public.%I for delete to authenticated using (organization_id = public.current_organization_id() and public.is_current_organization_professional(professional_id) and (public.is_manager() or ((public.has_permission(''agenda'') or public.has_permission(''controle'')) and professional_id = public.current_professional_id())))',
       table_name || '_delete_member', table_name
     );
   end loop;
 end;
 $$;

 drop policy if exists professionals_manager_write on public.professionals;
 create policy professionals_manager_write on public.professionals
 for all to authenticated
 using (organization_id = public.current_organization_id() and public.has_permission('profissionais'))
 with check (organization_id = public.current_organization_id() and public.has_permission('profissionais'));

 drop policy if exists settings_manager_write on public.organization_settings;
 create policy settings_manager_write on public.organization_settings
 for all to authenticated
 using (organization_id = public.current_organization_id() and public.has_any_role(array['gestor', 'dev-admin']))
 with check (organization_id = public.current_organization_id() and public.has_any_role(array['gestor', 'dev-admin']));

 drop policy if exists clients_write_sales on public.clients;
 create policy clients_write_sales on public.clients
 for all to authenticated
 using (organization_id = public.current_organization_id() and public.has_permission('clientes'))
 with check (organization_id = public.current_organization_id() and public.has_permission('clientes'));

 do $$
 declare
   table_name text;
   permission_key text;
 begin
   foreach table_name in array array['products', 'expenses', 'incomes', 'subscription_plans'] loop
     permission_key := case
       when table_name = 'products' then 'produtos'
       when table_name = 'subscription_plans' then 'planos'
       else 'financeiro'
     end;
     execute format('drop policy if exists %I on public.%I', table_name || '_manager_write', table_name);
     execute format('create policy %I on public.%I for all to authenticated using (organization_id = public.current_organization_id() and public.has_permission(%L)) with check (organization_id = public.current_organization_id() and public.has_permission(%L))', table_name || '_manager_write', table_name, permission_key, permission_key);
   end loop;
 end;
 $$;

 -- ============================================================================
 -- Storage
 -- ============================================================================

 insert into storage.buckets (id, name, public)
 values ('avatars', 'avatars', false), ('logos', 'logos', false)
 on conflict (id) do update set public = excluded.public;

 drop policy if exists avatar_owner_access on storage.objects;
 create policy avatar_owner_access on storage.objects
 for all to authenticated
 using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
 with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

 drop policy if exists logo_manager_access on storage.objects;
 create policy logo_manager_access on storage.objects
 for all to authenticated
 using (bucket_id = 'logos' and (storage.foldername(name))[1] = public.current_organization_id()::text and public.has_any_role(array['gestor', 'dev-admin']))
 with check (bucket_id = 'logos' and (storage.foldername(name))[1] = public.current_organization_id()::text and public.has_any_role(array['gestor', 'dev-admin']));

 -- Keep this version in sync with currentSchemaVersion in e2e/provision.ts.
 alter table public.schema_metadata enable row level security;
 revoke all on table public.schema_metadata from public;
 grant select on table public.schema_metadata to service_role;
 insert into public.schema_metadata (key, value)
  values ('app_schema_version', '2026-09-07')
 on conflict (key) do update
   set value = excluded.value, updated_at = now();