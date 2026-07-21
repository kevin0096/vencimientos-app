-- ============================================================
-- Control de Vencimientos — esquema de base de datos (Supabase)
-- Pegar TODO este archivo en: Supabase → SQL Editor → Run
-- ============================================================

-- Perfiles de usuario (se crea uno automáticamente al registrarse)
create table public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nombre text not null default '',
  aprobado boolean not null default false,
  es_admin boolean not null default false,
  creado_en timestamptz not null default now()
);

alter table public.perfiles enable row level security;

-- Funciones auxiliares (security definer para evitar recursión en las políticas)
create or replace function public.es_admin() returns boolean
language sql security definer stable as $$
  select coalesce((select es_admin from public.perfiles where id = auth.uid()), false);
$$;

create or replace function public.esta_aprobado() returns boolean
language sql security definer stable as $$
  select coalesce((select aprobado from public.perfiles where id = auth.uid()), false);
$$;

create policy "ver perfiles" on public.perfiles
  for select using (id = auth.uid() or public.es_admin());

create policy "admin actualiza perfiles" on public.perfiles
  for update using (public.es_admin());

-- El admin es el dueño: su cuenta queda aprobada y con permisos al registrarse
create or replace function public.crear_perfil() returns trigger
language plpgsql security definer as $$
begin
  insert into public.perfiles (id, email, nombre, aprobado, es_admin)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nombre', ''),
    new.email = 'kevin.gianssp.96@gmail.com',
    new.email = 'kevin.gianssp.96@gmail.com'
  );
  return new;
end;
$$;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil();

-- Productos (compartidos entre todos los celulares)
create table public.productos (
  id bigint generated always as identity primary key,
  nombre text not null,
  categoria text not null,
  cantidad int not null default 1,
  precio numeric(10,2) not null default 0,
  proveedor text not null default '',
  fecha_vencimiento date not null,
  anticipacion int not null default 1,
  foto text,
  creado_por uuid references public.perfiles(id),
  creado_por_nombre text not null default '',
  creado_en timestamptz not null default now(),
  retirado boolean not null default false,
  retirado_en timestamptz,
  retirado_por_nombre text
);

alter table public.productos enable row level security;

create policy "aprobados leen productos" on public.productos
  for select using (public.esta_aprobado());
create policy "aprobados crean productos" on public.productos
  for insert with check (public.esta_aprobado());
create policy "aprobados actualizan productos" on public.productos
  for update using (public.esta_aprobado());
create policy "aprobados eliminan productos" on public.productos
  for delete using (public.esta_aprobado());

-- Índices para el dashboard
create index idx_productos_retirado on public.productos (retirado, retirado_en);
create index idx_productos_fecha on public.productos (fecha_vencimiento);
