-- Precio (para el control de pérdidas en S/) y proveedor.
-- Pegar TODO esto en: Supabase → SQL Editor → Run
alter table public.productos add column if not exists precio numeric(10,2) not null default 0;
alter table public.productos add column if not exists proveedor text not null default '';

-- El catálogo también recuerda precio y proveedor por código de barras
alter table public.catalogo add column if not exists precio numeric(10,2) not null default 0;
alter table public.catalogo add column if not exists proveedor text not null default '';
