# 📦 Control de Vencimientos — Guía de instalación y uso

Aplicación Android para la bodega: cada trabajador toma foto a los productos,
registra su fecha de vencimiento y la app avisa con una notificación (alarma)
antes de que venzan. Los datos se comparten entre todos los celulares y el
administrador (Kevin) controla quién tiene acceso.

## Antes de instalar

⚠️ Primero hay que configurar la nube (una sola vez): revisa
**CONFIGURAR-NUBE.md**. Sin eso la app mostrará "Falta configurar la
conexión a la nube".

## Instalar en los celulares (sin Play Store)

El archivo a compartir es:
`android\app\build\outputs\apk\debug\app-debug.apk`
(o la copia `ControlVencimientos.apk` del escritorio)

1. Envía el APK a cada celular por **WhatsApp** (como documento),
   **Google Drive**, **correo** o **cable USB**.
2. En el celular, abre el archivo APK descargado.
3. Acepta el permiso de "instalar aplicaciones de origen desconocido"
   (se pide una sola vez).
4. Toca **Instalar**. Se puede instalar en 10 o más celulares, sin límite.

> Si Google Play Protect avisa, toca **"Instalar de todos modos"**.
> Es normal en apps compartidas por APK.

## Primer uso en cada celular

1. **Registro**: cada trabajador toca "¿No tienes cuenta? Regístrate" y crea
   su usuario (nombre, correo y contraseña).
2. **Aprobación**: el admin entra a la pestaña **👥 Usuarios** y toca
   **Dar acceso**. Recién ahí el trabajador puede entrar.
3. **Permisos**: al entrar, aceptar el permiso de **notificaciones** (y el de
   "alarmas y recordatorios" si lo pregunta).
4. Recomendado: en Ajustes → Batería, quitar la app de la "optimización de
   batería" para que las alarmas nunca se retrasen (importante en Xiaomi,
   Huawei, Oppo y similares).

La app necesita **internet** para ver y guardar productos (los datos son
compartidos). Las alarmas suenan aunque no haya internet en ese momento.

## Cómo se usa

### Registrar un producto
1. Toca **+ 📷** → se abre la cámara → toma la foto del producto.
2. Escribe el nombre, elige la **categoría** (Snack, Frutos secos, Galletas,
   Check out, Pastelitos, Abarrotes, Bebidas, Dulces premium, Cervezas y
   cigarros), la **fecha de vencimiento** y con cuánta anticipación avisar
   (1, 2, 3 o 7 días).
3. **Guardar**. Todos los celulares verán el producto y recibirán la alarma.

### Alarmas
- Suena una notificación **1 día antes** (o los días que elijas) a las
  8:00 a.m. y otra **el día del vencimiento**.
- Al abrir la app también avisa si hay productos vencidos o por vencer.

### Retirar un producto
Cuando saques de la tienda un producto vencido o por vencer, toca
**✅ Retirar** en su tarjeta. Queda registrado quién lo retiró y cuándo.

### Dashboard 📊
Muestra cuántos productos se van retirando: hoy, últimos 7 días, este mes y
total; con gráficos por **categoría** y por **usuario**, y el historial de
los últimos retiros.

### Usuarios 👥 (solo el admin)
Lista de todos los usuarios registrados con botones **Dar acceso** /
**Quitar acceso**.

## Notas técnicas

- Nube: Supabase (plan gratuito). Fotos comprimidas a ~700px para no llenar
  la base de datos.
- Las alarmas se programan localmente en cada celular y sobreviven al
  reinicio del teléfono.
- Para recompilar el APK: `npx cap sync android` y luego
  `.\gradlew.bat assembleDebug` dentro de la carpeta `android`
  (con JAVA_HOME apuntando a JDK 21 y ANDROID_HOME a C:\Android\Sdk).
