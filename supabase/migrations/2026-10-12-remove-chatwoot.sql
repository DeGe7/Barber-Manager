-- Remove Chatwoot configuration, stored credentials, and role permissions.
-- Run once in each Supabase project that received the Chatwoot migrations.
begin;

update public.organization_settings as settings
   set payload = jsonb_set(
     settings.payload,
     '{roles}',
     coalesce((
       select jsonb_agg(
         case
           when jsonb_typeof(role.value->'permissions') = 'array' then
             jsonb_set(
               role.value,
               '{permissions}',
               coalesce((
                 select jsonb_agg(permission.value)
                   from jsonb_array_elements(role.value->'permissions') as permission(value)
                  where permission.value <> '"chatwoot"'::jsonb
               ), '[]'::jsonb)
             )
           else role.value
         end
         order by role.ordinality
       )
         from jsonb_array_elements(settings.payload->'roles')
              with ordinality as role(value, ordinality)
     ), '[]'::jsonb)
   )
 where jsonb_typeof(settings.payload->'roles') = 'array'
   and exists (
     select 1
       from jsonb_array_elements(settings.payload->'roles') as role(value)
      where jsonb_typeof(role.value->'permissions') = 'array'
        and (role.value->'permissions') ? 'chatwoot'
   );

drop table if exists public.chatwoot_integrations cascade;

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
  role_key := public.current_user_role();
  if public.is_manager() then
    return true;
  end if;

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

insert into public.schema_metadata (key, value)
values ('app_schema_version', '2026-10-12')
on conflict (key) do update set value = excluded.value;

commit;
