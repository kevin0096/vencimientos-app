# ☁️ Configurar la nube (Supabase) — 10 minutos, gratis

La app ya está lista; solo falta crear la base de datos en la nube donde se
comparten usuarios, productos y el dashboard entre los 10 celulares.
**Estos pasos los haces tú una sola vez** (necesitan crear una cuenta, cosa
que debes hacer tú personalmente):

## Paso 1 — Crear la cuenta y el proyecto

1. Entra a <https://supabase.com> y toca **Start your project** →
   **Sign up** (puedes entrar con tu cuenta de Google).
2. Crea una organización (nombre libre, plan **Free**).
3. Toca **New project**:
   - **Name**: `vencimientos`
   - **Database password**: inventa una y guárdala (no se usa en la app)
   - **Region**: South America (São Paulo)
4. Espera 1-2 minutos a que el proyecto termine de crearse.

## Paso 2 — Crear las tablas

1. En el menú izquierdo abre **SQL Editor**.
2. Abre el archivo `supabase-schema.sql` (está en esta carpeta), copia
   **todo** su contenido y pégalo en el editor.
3. Toca **Run**. Debe decir "Success. No rows returned".

> El esquema ya deja tu correo (`kevin.gianssp.96@gmail.com`) como
> **administrador automático**: cuando te registres en la app con ese
> correo, entras directo y con el panel de usuarios.

## Paso 3 — Desactivar la confirmación por correo

Para que tus trabajadores no tengan que confirmar un email:

1. Menú izquierdo → **Authentication** → **Sign In / Providers**.
2. En **Email**, desactiva la opción **Confirm email** y guarda.

## Paso 4 — Copiar las 2 claves para la app

1. Menú izquierdo → ⚙️ **Project Settings** → **API Keys** (o **Data API**).
2. Copia estos 2 datos y pásamelos:
   - **Project URL** (algo como `https://abcdefgh.supabase.co`)
   - **anon public key** (un texto largo que empieza con `eyJ...` o `sb_publishable_...`)

Con esos 2 datos yo los pego en `www/config.js`, recompilo el APK y queda
listo para repartir a los celulares.

## Cómo funciona el acceso

1. Cada trabajador abre la app, toca **"¿No tienes cuenta? Regístrate"** y
   crea su usuario con su nombre, correo y contraseña.
2. Al entrar verá "tu cuenta todavía no tiene acceso".
3. Tú entras con tu correo de admin → pestaña **👥 Usuarios** → tocas
   **Dar acceso** al trabajador. Desde ese momento ya puede usar la app.
4. Puedes quitarle el acceso en cualquier momento con un toque.
