-- ============================================================
-- Refuerzo de seguridad (29-oct-2026)
-- 1) La autoría (quién registró / quién retiró y cuándo) la pone la
--    base de datos, no el celular: no se puede falsificar.
-- 2) Un producto ya retirado solo lo modifica el administrador
--    (el resto solo puede "devolverlo a la lista").
-- 3) Solo el administrador puede eliminar productos.
-- 4) Registro de auditoría de todo cambio en productos y perfiles,
--    visible solo para el administrador.
-- Pegar TODO en: Supabase → SQL Editor → Run
-- ============================================================

alter table public.productos add column if not exists retirado_por uuid references public.perfiles(id);

create table if not exists public.auditoria (
  id bigint generated always as identity primary key,
  tabla text not null,
  accion text not null,
  registro text,
  usuario uuid,
  usuario_nombre text,
  cuando timestamptz not null default now(),
  antes jsonb,
  despues jsonb
);
alter table public.auditoria enable row level security;
drop policy if exists "admin lee auditoria" on public.auditoria;
create policy "admin lee auditoria" on public.auditoria for select using (public.es_admin());

create or replace function public.nombre_usuario() returns text
language sql security definer stable set search_path = public as $$
  select coalesce(
    (select nullif(nombre, '') from public.perfiles where id = auth.uid()),
    (select email from public.perfiles where id = auth.uid()),
    'sistema')
$$;

create or replace function public.proteger_producto() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.creado_por := auth.uid();
    new.creado_por_nombre := public.nombre_usuario();
    new.creado_en := now();
    new.retirado := false;
    new.retirado_en := null;
    new.retirado_por := null;
    new.retirado_por_nombre := null;
    return new;
  end if;
  new.creado_por := old.creado_por;
  new.creado_por_nombre := old.creado_por_nombre;
  new.creado_en := old.creado_en;
  if old.retirado and new.retirado and not public.es_admin() then
    raise exception 'Un producto retirado solo lo puede modificar el administrador';
  end if;
  if new.retirado and not old.retirado then
    new.retirado_en := now();
    new.retirado_por := auth.uid();
    new.retirado_por_nombre := public.nombre_usuario();
  elsif not new.retirado then
    new.retirado_en := null;
    new.retirado_por := null;
    new.retirado_por_nombre := null;
  end if;
  return new;
end
$$;
drop trigger if exists proteger_producto on public.productos;
create trigger proteger_producto before insert or update on public.productos
  for each row execute function public.proteger_producto();

create or replace function public.auditar() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_antes jsonb;
  v_despues jsonb;
begin
  if tg_op <> 'INSERT' then v_antes := to_jsonb(old) - 'foto'; end if;
  if tg_op <> 'DELETE' then v_despues := to_jsonb(new) - 'foto'; end if;
  insert into public.auditoria (tabla, accion, registro, usuario, usuario_nombre, antes, despues)
  values (tg_table_name, tg_op, coalesce(v_despues ->> 'id', v_antes ->> 'id'), auth.uid(),
          public.nombre_usuario(), v_antes, v_despues);
  return coalesce(new, old);
end
$$;
drop trigger if exists auditar_productos on public.productos;
create trigger auditar_productos after insert or update or delete on public.productos
  for each row execute function public.auditar();
drop trigger if exists auditar_perfiles on public.perfiles;
create trigger auditar_perfiles after update or delete on public.perfiles
  for each row execute function public.auditar();

drop policy if exists "aprobados eliminan productos" on public.productos;
drop policy if exists "admin elimina productos" on public.productos;
create policy "admin elimina productos" on public.productos for delete using (public.es_admin());
