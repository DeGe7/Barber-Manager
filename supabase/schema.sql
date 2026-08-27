-- Barber Manager — schema Supabase
-- Execute no SQL Editor do projeto Supabase.
--
-- Este script:
--   1. cria as tabelas usadas pelos recursos atuais do frontend/API;
--   2. sincroniza auth.users -> public.usuarios;
--   3. prepara vínculo por empresa sem atribuir empresa automaticamente;
--   4. habilita RLS para a futura migração do frontend/API.
--
-- Não migra os dados atuais da API Drizzle e não altera o banco do Replit.
-- O frontend atual ainda lê os recursos de /api/*; as políticas abaixo só
-- serão aplicadas quando esses recursos passarem a ser acessados no Supabase.

create extension if not exists "pgcrypto";

-- ============================================================================
-- Empresas e usuários
-- ============================================================================

create table if not exists public.empresas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cnpj text not null default '',
  address text not null default '',
  logo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists empresas_cnpj_idx on public.empresas (cnpj);

create table if not exists public.professionals (
  id text primary key,
  name text not null,
  role text not null default 'barbeiro'
    check (role in ('barbeiro', 'manicure', 'vendedor', 'gestor')),
  initials text not null default '',
  color text not null default '#3b82f6',
  is_active boolean not null default true,
  commissions jsonb not null default '{}'::jsonb,
  empresa_id uuid references public.empresas(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists professionals_empresa_idx
  on public.professionals (empresa_id);
create index if not exists professionals_active_role_idx
  on public.professionals (empresa_id, is_active, role);

create table if not exists public.usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  name text not null default 'Usuário',
  role text
    check (role is null or role in ('gestor', 'dev-admin', 'barbeiro', 'manicure', 'vendedor')),
  professional_id text references public.professionals(id) on delete set null,
  avatar text,
  empresa_id uuid references public.empresas(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists usuarios_empresa_idx
  on public.usuarios (empresa_id);
create index if not exists usuarios_professional_idx
  on public.usuarios (professional_id);
create index if not exists usuarios_role_idx
  on public.usuarios (role);

-- ============================================================================
-- Dados operacionais
-- ============================================================================

create table if not exists public.appointments (
  id text primary key,
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
  pay_method text not null default 'pix'
    check (pay_method in ('debito', 'credito', 'pix', 'dinheiro')),
  payment_splits jsonb not null default '[]'::jsonb,
  notes text,
  empresa_id uuid references public.empresas(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists appointments_empresa_date_idx
  on public.appointments (empresa_id, date, time);
create index if not exists appointments_professional_date_idx
  on public.appointments (professional_id, date, time);
create index if not exists appointments_status_idx
  on public.appointments (empresa_id, status);

create table if not exists public.blocks (
  id text primary key,
  date text not null,
  professional_id text not null references public.professionals(id) on delete restrict,
  slots jsonb not null default '[]'::jsonb,
  reason text not null default '',
  notes text,
  empresa_id uuid references public.empresas(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists blocks_empresa_date_idx
  on public.blocks (empresa_id, date);
create index if not exists blocks_professional_date_idx
  on public.blocks (professional_id, date);

create table if not exists public.clients (
  id text primary key,
  name text not null,
  email text not null default '',
  whatsapp text not null default '',
  birthday text,
  source text,
  source_other text,
  interest text not null default 'barbearia'
    check (interest in ('barbearia', 'salao', 'protese')),
  created_at text not null,
  visits jsonb not null default '[]'::jsonb,
  empresa_id uuid references public.empresas(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists clients_empresa_idx
  on public.clients (empresa_id);
create index if not exists clients_birthday_idx
  on public.clients (empresa_id, birthday);
create index if not exists clients_whatsapp_idx
  on public.clients (empresa_id, whatsapp);

create table if not exists public.products (
  id text primary key,
  name text not null,
  category text not null default '',
  price double precision not null default 0 check (price >= 0),
  cost double precision not null default 0 check (cost >= 0),
  stock integer not null default 0 check (stock >= 0),
  min_stock integer not null default 0 check (min_stock >= 0),
  is_active boolean not null default true,
  empresa_id uuid references public.empresas(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_empresa_active_idx
  on public.products (empresa_id, is_active);
create index if not exists products_stock_idx
  on public.products (empresa_id, stock, min_stock);

create table if not exists public.expenses (
  id text primary key,
  date text not null,
  description text not null,
  amount double precision not null default 0 check (amount >= 0),
  category text not null default 'Outros'
    check (category in ('Aluguel', 'Produtos', 'Marketing', 'Folha de pagamento', 'Manutenção', 'Outros')),
  empresa_id uuid references public.empresas(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists expenses_empresa_date_idx
  on public.expenses (empresa_id, date);
create index if not exists expenses_category_idx
  on public.expenses (empresa_id, category);

create table if not exists public.incomes (
  id text primary key,
  date text not null,
  description text not null,
  amount double precision not null default 0 check (amount >= 0),
  empresa_id uuid references public.empresas(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists incomes_empresa_date_idx
  on public.incomes (empresa_id, date);

create table if not exists public.prothesis_sales (
  id text primary key,
  date text not null,
  client text not null,
  whatsapp text,
  value double precision not null default 0 check (value >= 0),
  seller_id text not null references public.professionals(id) on delete restrict,
  installments integer not null default 1 check (installments > 0),
  installments_paid integer not null default 0
    check (installments_paid >= 0 and installments_paid <= installments),
  pay_method1 text not null default 'pix'
    check (pay_method1 in ('debito', 'credito', 'pix', 'dinheiro')),
  pay_amount1 double precision not null default 0 check (pay_amount1 >= 0),
  pay_method2 text
    check (pay_method2 is null or pay_method2 in ('debito', 'credito', 'pix', 'dinheiro')),
  pay_amount2 double precision check (pay_amount2 is null or pay_amount2 >= 0),
  last_maintenance text,
  notes text,
  empresa_id uuid references public.empresas(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists prothesis_sales_empresa_date_idx
  on public.prothesis_sales (empresa_id, date);
create index if not exists prothesis_sales_seller_idx
  on public.prothesis_sales (seller_id, date);

create table if not exists public.mentoria_sessions (
  id text primary key,
  date text not null,
  client text not null,
  seller_id text not null references public.professionals(id) on delete restrict,
  value double precision not null default 0 check (value >= 0),
  duration_hours integer not null default 2 check (duration_hours > 0),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'cancelled')),
  notes text,
  empresa_id uuid references public.empresas(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mentoria_sessions_empresa_date_idx
  on public.mentoria_sessions (empresa_id, date);
create index if not exists mentoria_sessions_seller_idx
  on public.mentoria_sessions (seller_id, date);

create table if not exists public.subscription_plans (
  id text primary key,
  name text not null,
  price double precision not null default 0 check (price >= 0),
  services jsonb not null default '[]'::jsonb,
  duration text not null default 'Mensal'
    check (duration in ('Mensal', 'Trimestral', 'Semestral', 'Anual')),
  empresa_id uuid references public.empresas(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscription_plans_empresa_idx
  on public.subscription_plans (empresa_id);

create table if not exists public.subscribers (
  id text primary key,
  name text not null,
  phone text not null default '',
  plan_id text not null references public.subscription_plans(id) on delete restrict,
  professional_id text not null references public.professionals(id) on delete restrict,
  start_date text not null,
  next_payment text not null,
  status text not null default 'ativo'
    check (status in ('ativo', 'vencido', 'pendente')),
  empresa_id uuid references public.empresas(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscribers_empresa_status_idx
  on public.subscribers (empresa_id, status);
create index if not exists subscribers_next_payment_idx
  on public.subscribers (empresa_id, next_payment);

-- A API atual armazena BarbeariaConfig como JSON neste registro singleton.
-- services, roles, paymentMethods, clientSources e clientSegments ficam dentro
-- de value para preservar o contrato atual de /api/config.
create table if not exists public.config (
  key text primary key,
  value text not null,
  empresa_id uuid references public.empresas(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists config_empresa_idx
  on public.config (empresa_id);

-- ============================================================================
-- Funções e triggers
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists empresas_set_updated_at on public.empresas;
create trigger empresas_set_updated_at
before update on public.empresas
for each row execute function public.set_updated_at();

drop trigger if exists professionals_set_updated_at on public.professionals;
create trigger professionals_set_updated_at
before update on public.professionals
for each row execute function public.set_updated_at();

drop trigger if exists usuarios_set_updated_at on public.usuarios;
create trigger usuarios_set_updated_at
before update on public.usuarios
for each row execute function public.set_updated_at();

drop trigger if exists appointments_set_updated_at on public.appointments;
create trigger appointments_set_updated_at
before update on public.appointments
for each row execute function public.set_updated_at();

drop trigger if exists blocks_set_updated_at on public.blocks;
create trigger blocks_set_updated_at
before update on public.blocks
for each row execute function public.set_updated_at();

drop trigger if exists clients_set_updated_at on public.clients;
create trigger clients_set_updated_at
before update on public.clients
for each row execute function public.set_updated_at();

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists prothesis_sales_set_updated_at on public.prothesis_sales;
create trigger prothesis_sales_set_updated_at
before update on public.prothesis_sales
for each row execute function public.set_updated_at();

drop trigger if exists mentoria_sessions_set_updated_at on public.mentoria_sessions;
create trigger mentoria_sessions_set_updated_at
before update on public.mentoria_sessions
for each row execute function public.set_updated_at();

drop trigger if exists subscription_plans_set_updated_at on public.subscription_plans;
create trigger subscription_plans_set_updated_at
before update on public.subscription_plans
for each row execute function public.set_updated_at();

drop trigger if exists subscribers_set_updated_at on public.subscribers;
create trigger subscribers_set_updated_at
before update on public.subscribers
for each row execute function public.set_updated_at();

drop trigger if exists config_set_updated_at on public.config;
create trigger config_set_updated_at
before update on public.config
for each row execute function public.set_updated_at();

-- Retorna o nome enviado pelo cadastro, com fallback seguro para o e-mail.
-- role, empresa_id, professional_id e avatar não são aceitos do cadastro.
create or replace function public.handle_auth_user_sync()
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

  insert into public.usuarios (id, email, name)
  values (new.id, coalesce(new.email, ''), resolved_name)
  on conflict (id) do update
    set email = excluded.email,
        name = excluded.name,
        updated_at = now();

  return new;
end;
$$;

revoke all on function public.handle_auth_user_sync() from public;

drop trigger if exists on_auth_user_sync on auth.users;
create trigger on_auth_user_sync
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function public.handle_auth_user_sync();

-- Só permite consultar a empresa de um usuário autenticado que pertença a ela.
-- A função é SECURITY DEFINER para evitar recursão de RLS ao consultar usuarios.
create or replace function public.is_empresa_member(target_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_empresa_id is not null
    and exists (
      select 1
      from public.usuarios u
      where u.id = auth.uid()
        and u.empresa_id = target_empresa_id
    );
$$;

revoke all on function public.is_empresa_member(uuid) from public;
grant execute on function public.is_empresa_member(uuid) to authenticated;

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.empresas enable row level security;
alter table public.usuarios enable row level security;
alter table public.professionals enable row level security;
alter table public.appointments enable row level security;
alter table public.blocks enable row level security;
alter table public.clients enable row level security;
alter table public.products enable row level security;
alter table public.expenses enable row level security;
alter table public.incomes enable row level security;
alter table public.prothesis_sales enable row level security;
alter table public.mentoria_sessions enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.subscribers enable row level security;
alter table public.config enable row level security;

-- O próprio usuário pode consultar seu perfil. Alterações de nome passam por
-- auth.updateUser(), que atualiza raw_user_meta_data e dispara a trigger.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'usuarios'
      and policyname = 'usuarios_select_own'
  ) then
    create policy usuarios_select_own on public.usuarios
      for select to authenticated
      using (id = auth.uid());
  end if;
end
$$;

-- Nenhuma policy pública permite autoatribuir role, empresa_id ou professional_id.
-- Atribuições administrativas devem usar backend/service_role.

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'empresas'
      and policyname = 'empresas_member_select'
  ) then
    create policy empresas_member_select on public.empresas
      for select to authenticated
      using (public.is_empresa_member(id));
  end if;
end
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'professionals',
    'appointments',
    'blocks',
    'clients',
    'products',
    'expenses',
    'incomes',
    'prothesis_sales',
    'mentoria_sessions',
    'subscription_plans',
    'subscribers',
    'config'
  ] loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = table_name
        and policyname = table_name || '_empresa_access'
    ) then
      execute format(
        'create policy %I on public.%I for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id))',
        table_name || '_empresa_access',
        table_name
      );
    end if;
  end loop;
end
$$;

-- ============================================================================
-- Seed opcional
-- ============================================================================
-- O seed abaixo não é executado automaticamente. Descomente somente depois de
-- criar uma empresa e decidir que ela deve receber a configuração inicial.
--
-- insert into public.config (key, value, empresa_id)
-- values (
--   'barbeariaConfig',
--   '{"name":"Barber Manager","cnpj":"","address":"","services":[],"roles":[],"paymentMethods":[{"key":"pix","label":"PIX","isActive":true},{"key":"dinheiro","label":"Dinheiro","isActive":true},{"key":"debito","label":"Débito","isActive":true},{"key":"credito","label":"Crédito","isActive":true}],"clientSources":["Indicação","Instagram","Google","Facebook","Site","Passou na rua","Outro"],"clientSegments":[{"key":"barbearia","label":"Barbearia"},{"key":"salao","label":"Salão de Beleza"},{"key":"protese","label":"Prótese Capilar"}],"defaultServiceDuration":30}'::text,
--   '00000000-0000-0000-0000-000000000000'
-- )
-- on conflict (key) do update set value = excluded.value;

-- ============================================================================
-- Limites conhecidos da integração atual
-- ============================================================================
-- 1. O cadastro atual envia somente auth.users.email e metadata.full_name.
-- 2. role começa NULL para manter o onboarding.
-- 3. empresa_id e professional_id só podem ser atribuídos por fluxo
--    administrativo; o frontend atual ainda guarda esses valores no
--    localStorage e envia headers de compatibilidade para a API Drizzle.
-- 4. O valor 'dev-admin' está previsto em public.usuarios.role e possui o
--    mesmo nível conceitual de acesso do gestor, mas a API atual precisa ser
--    migrada para ler uma identidade JWT verificada antes de aplicar RLS.