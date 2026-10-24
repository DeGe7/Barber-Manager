begin;

create or replace function public.default_role_permissions(target_role text)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case target_role
    when 'gestor' then '["dashboard","agenda","controle","clientes","profissionais","vendas","produtos","planos","financeiro","comunicacao","configuracoes"]'::jsonb
    when 'dev-admin' then '["dashboard","agenda","controle","clientes","profissionais","vendas","produtos","planos","financeiro","comunicacao","configuracoes"]'::jsonb
    when 'recepcao' then '["dashboard","agenda","controle","clientes","produtos","planos"]'::jsonb
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
               '["dashboard","agenda","controle","clientes","produtos","planos"]'::jsonb,
               true
             ),
             '{description}',
             to_jsonb('Acesso operacional sem Financeiro, Equipe, Configurações ou Disparos de Mensagens; não é um perfil profissional.'::text),
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
       'description', 'Acesso operacional sem Financeiro, Equipe, Configurações ou Disparos de Mensagens; não é um perfil profissional.',
       'isActive', true,
       'permissions', '["dashboard","agenda","controle","clientes","produtos","planos"]'::jsonb
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
     and permission_key in ('financeiro', 'profissionais', 'configuracoes', 'comunicacao') then
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

insert into public.schema_metadata (key, value)
values ('app_schema_version', '2026-10-23.4')
on conflict (key) do update
set value = excluded.value, updated_at = now();

commit;
