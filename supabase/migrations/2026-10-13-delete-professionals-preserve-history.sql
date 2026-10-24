-- Permite excluir profissionais sem apagar o histórico do estabelecimento.
-- Aplicar no SQL Editor de cada projeto Supabase antes de usar a exclusão.
begin;

do $$
declare
  link record;
  fk record;
begin
  for link in select * from (values
    ('organization_invitations', 'professional_id'),
    ('appointments', 'professional_id'),
    ('blocks', 'professional_id'),
    ('prothesis_sales', 'seller_id'),
    ('mentoria_sessions', 'seller_id'),
    ('subscribers', 'professional_id')
  ) as links(table_name, column_name)
  loop
    execute format('alter table public.%I alter column %I drop not null', link.table_name, link.column_name);
    for fk in
      select c.conname
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
      where c.conrelid = format('public.%I', link.table_name)::regclass
        and c.confrelid = 'public.professionals'::regclass
        and c.contype = 'f' and a.attname = link.column_name
    loop
      execute format('alter table public.%I drop constraint %I', link.table_name, fk.conname);
    end loop;
    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references public.professionals(id) on delete set null',
      link.table_name, link.table_name || '_' || link.column_name || '_fkey', link.column_name
    );
  end loop;
end;
$$;

-- Somente gestores podem acessar histórico sem profissional; o isolamento
-- por organização continua sendo exigido pelas políticas de cada tabela.
create or replace function public.is_current_organization_professional(target_professional_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    (target_professional_id is null and public.current_user_role() in ('gestor', 'dev-admin'))
    or exists (
      select 1 from public.professionals
      where id = target_professional_id
        and organization_id = public.current_organization_id()
    );
$$;

create or replace function public.prepare_professional_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.organization_members
     set professional_id = null, is_active = false
   where professional_id = old.id and organization_id = old.organization_id;
  update public.organization_invitations
     set professional_id = null,
         revoked_at = case when accepted_at is null then coalesce(revoked_at, now()) else revoked_at end
   where professional_id = old.id and organization_id = old.organization_id;
  return old;
end;
$$;

revoke all on function public.prepare_professional_deletion() from public, anon, authenticated;
drop trigger if exists professionals_prepare_deletion on public.professionals;
create trigger professionals_prepare_deletion
before delete on public.professionals
for each row execute function public.prepare_professional_deletion();

-- A interface usa este RPC: sem a migração, nenhuma exclusão é iniciada.
create or replace function public.delete_professional_preserving_history(p_professional_id text)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  deleted_id text;
begin
  delete from public.professionals
   where id = p_professional_id
     and organization_id = public.current_organization_id()
   returning id into deleted_id;
  if deleted_id is null then
    raise exception 'Profissional não encontrado ou sem permissão para excluir.';
  end if;
  return deleted_id;
end;
$$;
revoke all on function public.delete_professional_preserving_history(text) from public, anon;
grant execute on function public.delete_professional_preserving_history(text) to authenticated;

insert into public.schema_metadata (key, value)
values ('app_schema_version', '2026-10-13')
on conflict (key) do update set value = excluded.value, updated_at = now();

commit;
