-- Catálogo propio de la bodega: código de barras -> nombre, categoría y foto.
-- Cada producto que registren queda memorizado para el próximo escaneo.
-- Pegar TODO esto en: Supabase → SQL Editor → Run
create table if not exists public.catalogo (
  codigo text primary key,
  nombre text not null,
  categoria text,
  foto text,
  creado_en timestamptz not null default now()
);

alter table public.catalogo enable row level security;

drop policy if exists "aprobados leen catalogo" on public.catalogo;
create policy "aprobados leen catalogo" on public.catalogo
  for select using (public.esta_aprobado());

drop policy if exists "aprobados agregan catalogo" on public.catalogo;
create policy "aprobados agregan catalogo" on public.catalogo
  for insert with check (public.esta_aprobado());

drop policy if exists "aprobados actualizan catalogo" on public.catalogo;
create policy "aprobados actualizan catalogo" on public.catalogo
  for update using (public.esta_aprobado());
