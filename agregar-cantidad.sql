-- Nueva columna: cantidad de unidades por producto.
-- Pegar en: Supabase → SQL Editor → Run
alter table public.productos add column cantidad int not null default 1;
