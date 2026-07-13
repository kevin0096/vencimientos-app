// Control de Vencimientos — versión nube (multiusuario)
// Foto del producto + fecha de vencimiento + alarma + dashboard de retiros.
// Datos compartidos entre todos los celulares vía Supabase.

const esNativo = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const LocalNotifications = esNativo ? window.Capacitor.Plugins.LocalNotifications : null;

const HORA_AVISO_PREVIO = 21; // aviso previo: 9:00 pm del día anterior al vencimiento
const HORA_VENCE_HOY = 8;     // recordatorio del mismo día: 8:00 am

const CATEGORIAS = [
  'Snack',
  'Frutos secos',
  'Galletas',
  'Check out',
  'Pastelitos',
  'Abarrotes',
  'Bebidas',
  'Dulces premium',
  'Cervezas y cigarros',
];

const $ = (sel) => document.querySelector(sel);

// ---------- Conexión a la nube ----------
let sb = null;
let perfilActual = null;
let modoRegistro = false;
let filtroCategoria = 'Todos';
let fotoPendiente = null;
let productosCache = [];

function configValida() {
  const c = window.CONFIG_NUBE || {};
  return c.SUPABASE_URL && c.SUPABASE_URL.startsWith('https://') &&
         c.SUPABASE_ANON_KEY && c.SUPABASE_ANON_KEY.length > 20;
}

// ---------- Utilidades de fechas ----------
function hoySinHora() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function fechaLocalISO(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function parsearFecha(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d);
}

function diasRestantes(fechaIso) {
  return Math.round((parsearFecha(fechaIso) - hoySinHora()) / 86400000);
}

function formatearFecha(iso) {
  return parsearFecha(iso).toLocaleDateString('es-PE', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

// ---------- Cambio de pantallas ----------
function mostrarPantalla(id) {
  ['pantalla-config', 'pantalla-login', 'pantalla-espera', 'pantalla-app']
    .forEach((p) => $(`#${p}`).classList.toggle('oculto', p !== id));
}

function mostrarVista(nombre) {
  ['productos', 'dashboard', 'admin'].forEach((v) => {
    $(`#vista-${v}`).classList.toggle('oculto', v !== nombre);
  });
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('activa', t.dataset.tab === nombre);
  });
  $('#btn-agregar').classList.toggle('oculto', nombre !== 'productos');
  if (nombre === 'dashboard') pintarDashboard();
  if (nombre === 'admin') pintarUsuarios();
}

// ---------- Autenticación ----------
function mostrarErrorLogin(msj) {
  const el = $('#login-error');
  el.textContent = msj;
  el.classList.remove('oculto');
}

function traducirErrorAuth(error) {
  const m = (error && error.message) || '';
  if (m.includes('Invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (m.includes('already registered')) return 'Ese correo ya está registrado. Inicia sesión.';
  if (m.includes('at least 6 characters')) return 'La contraseña debe tener mínimo 6 caracteres.';
  if (m.includes('valid email')) return 'Escribe un correo válido.';
  if (m.includes('Failed to fetch') || m.includes('NetworkError')) return 'Sin conexión a internet. Verifica tu señal.';
  return 'Error: ' + m;
}

async function entrarORegistrar() {
  const email = $('#login-email').value.trim().toLowerCase();
  const password = $('#login-password').value;
  const nombre = $('#login-nombre').value.trim();

  $('#login-error').classList.add('oculto');
  if (!email || !password) { mostrarErrorLogin('Completa correo y contraseña.'); return; }
  if (modoRegistro && !nombre) { mostrarErrorLogin('Escribe tu nombre.'); return; }

  $('#btn-login').disabled = true;
  $('#btn-login').textContent = 'Conectando…';
  try {
    let error;
    if (modoRegistro) {
      ({ error } = await sb.auth.signUp({
        email, password, options: { data: { nombre } },
      }));
    } else {
      ({ error } = await sb.auth.signInWithPassword({ email, password }));
    }
    if (error) { mostrarErrorLogin(traducirErrorAuth(error)); return; }
    await arrancarSesion();
  } finally {
    $('#btn-login').disabled = false;
    $('#btn-login').textContent = modoRegistro ? 'Crear cuenta' : 'Entrar';
  }
}

function alternarModoLogin() {
  modoRegistro = !modoRegistro;
  $('#campo-nombre').classList.toggle('oculto', !modoRegistro);
  $('#login-subtitulo').textContent = modoRegistro
    ? 'Crea tu cuenta (el administrador debe aprobarla)'
    : 'Inicia sesión para continuar';
  $('#btn-login').textContent = modoRegistro ? 'Crear cuenta' : 'Entrar';
  $('#btn-cambiar-modo').textContent = modoRegistro
    ? '¿Ya tienes cuenta? Inicia sesión'
    : '¿No tienes cuenta? Regístrate';
  $('#login-error').classList.add('oculto');
}

async function cerrarSesion() {
  await sb.auth.signOut();
  perfilActual = null;
  mostrarPantalla('pantalla-login');
}

// Carga el perfil del usuario logueado y decide qué pantalla mostrar.
async function arrancarSesion() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { mostrarPantalla('pantalla-login'); return; }

  const { data: perfil, error } = await sb
    .from('perfiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (error || !perfil) {
    mostrarErrorLogin('No se pudo cargar tu perfil. Intenta de nuevo.');
    mostrarPantalla('pantalla-login');
    return;
  }

  perfilActual = perfil;

  if (!perfil.aprobado) { mostrarPantalla('pantalla-espera'); return; }

  $('#usuario-actual').textContent =
    `${perfil.nombre || perfil.email}${perfil.es_admin ? ' · Admin' : ''}`;
  $('#tab-admin').classList.toggle('oculto', !perfil.es_admin);
  mostrarPantalla('pantalla-app');
  mostrarVista('productos');
  await pedirPermisoNotificaciones();
  await cargarProductos();
  await reprogramarTodasLasAlarmas();
  avisoAlAbrir();
}

// ---------- Datos: productos ----------
async function cargarProductos() {
  $('#mensaje-cargando').classList.remove('oculto');
  const { data, error } = await sb
    .from('productos')
    .select('*')
    .eq('retirado', false)
    .order('fecha_vencimiento', { ascending: true });
  $('#mensaje-cargando').classList.add('oculto');
  if (error) {
    alert('No se pudieron cargar los productos: ' + error.message);
    return;
  }
  productosCache = data || [];
  pintarChips();
  pintarLista();
}

async function guardarNuevoProducto() {
  const nombre = $('#input-nombre').value.trim();
  const fecha = $('#input-fecha').value;
  const categoria = $('#input-categoria').value;
  if (!nombre) { alert('Escribe el nombre del producto.'); return; }
  if (!fecha) { alert('Elige la fecha de vencimiento.'); return; }

  $('#btn-guardar').disabled = true;
  $('#btn-guardar').textContent = 'Guardando…';
  try {
    const { data, error } = await sb.from('productos').insert({
      nombre,
      categoria,
      fecha_vencimiento: fecha,
      anticipacion: Number($('#input-anticipacion').value),
      foto: fotoPendiente,
      creado_por: perfilActual.id,
      creado_por_nombre: perfilActual.nombre || perfilActual.email,
    }).select().single();

    if (error) { alert('No se pudo guardar: ' + error.message); return; }

    await programarAlarmas(data);
    fotoPendiente = null;
    $('#modal-form').classList.add('oculto');
    await cargarProductos();
  } finally {
    $('#btn-guardar').disabled = false;
    $('#btn-guardar').textContent = 'Guardar';
  }
}

async function retirarProducto(p) {
  if (!confirm(`¿Confirmar que "${p.nombre}" fue retirado?`)) return;
  const { error } = await sb.from('productos').update({
    retirado: true,
    retirado_en: new Date().toISOString(),
    retirado_por_nombre: perfilActual.nombre || perfilActual.email,
  }).eq('id', p.id);
  if (error) { alert('No se pudo retirar: ' + error.message); return; }
  await cancelarAlarmas(p.id);
  await cargarProductos();
}

async function eliminarProducto(p) {
  if (!confirm(`¿Eliminar "${p.nombre}" definitivamente? (no cuenta como retiro)`)) return;
  const { error } = await sb.from('productos').delete().eq('id', p.id);
  if (error) { alert('No se pudo eliminar: ' + error.message); return; }
  await cancelarAlarmas(p.id);
  await cargarProductos();
}

// ---------- Notificaciones (alarmas) ----------
async function pedirPermisoNotificaciones() {
  if (esNativo) {
    const { display } = await LocalNotifications.requestPermissions();
    if (display === 'granted') {
      try {
        const exact = await LocalNotifications.checkExactNotificationSetting();
        if (exact && exact.exact_alarm !== 'granted') {
          await LocalNotifications.changeExactNotificationSetting();
        }
      } catch (_) { /* versiones antiguas de Android no lo necesitan */ }
    }
    return display === 'granted';
  }
  if ('Notification' in window && Notification.permission !== 'granted') {
    try { return (await Notification.requestPermission()) === 'granted'; }
    catch (_) { return false; }
  }
  return 'Notification' in window;
}

// Cada producto usa 2 ids: aviso previo y día del vencimiento (int de Java).
function idsNotificacion(idProducto) {
  const base = Number(idProducto) % 100000000;
  return [base * 10 + 1, base * 10 + 2];
}

function construirNotificaciones(p) {
  const [idAviso, idVence] = idsNotificacion(p.id);

  // Aviso previo: 9:00 pm, "anticipacion" días antes del vencimiento.
  // Ej: vence el 15/07 con 1 día de anticipación → suena el 14/07 a las 9 pm.
  const fechaAviso = parsearFecha(p.fecha_vencimiento);
  fechaAviso.setDate(fechaAviso.getDate() - p.anticipacion);
  fechaAviso.setHours(HORA_AVISO_PREVIO, 0, 0, 0);

  // Recordatorio del mismo día del vencimiento, temprano.
  const fechaVence = parsearFecha(p.fecha_vencimiento);
  fechaVence.setHours(HORA_VENCE_HOY, 0, 0, 0);

  const ahora = new Date();
  const lista = [];
  if (fechaAviso > ahora) {
    lista.push({
      id: idAviso,
      title: '⚠️ Producto por vencer',
      body: `"${p.nombre}" (${p.categoria}) vence ${p.anticipacion === 1 ? 'MAÑANA' : `en ${p.anticipacion} días`} (${formatearFecha(p.fecha_vencimiento)}). ¡Revísalo!`,
      schedule: { at: fechaAviso, allowWhileIdle: true },
    });
  }
  if (fechaVence > ahora) {
    lista.push({
      id: idVence,
      title: '🚨 ¡Producto vence HOY!',
      body: `"${p.nombre}" (${p.categoria}) vence hoy. Retíralo del stock.`,
      schedule: { at: fechaVence, allowWhileIdle: true },
    });
  }
  return lista;
}

async function programarAlarmas(p) {
  if (!esNativo) return;
  const lista = construirNotificaciones(p);
  if (lista.length) await LocalNotifications.schedule({ notifications: lista });
}

async function cancelarAlarmas(idProducto) {
  if (!esNativo) return;
  const [idAviso, idVence] = idsNotificacion(idProducto);
  try {
    await LocalNotifications.cancel({ notifications: [{ id: idAviso }, { id: idVence }] });
  } catch (_) { /* puede que ya no existan */ }
}

// Este celular programa las alarmas de TODOS los productos activos,
// así cualquier usuario recibe el aviso aunque otro haya registrado el producto.
async function reprogramarTodasLasAlarmas() {
  if (!esNativo) return;
  try {
    const { notifications: pendientes } = await LocalNotifications.getPending();
    if (pendientes && pendientes.length) {
      await LocalNotifications.cancel({ notifications: pendientes.map((n) => ({ id: n.id })) });
    }
    const todas = productosCache.flatMap(construirNotificaciones);
    // Android limita las alarmas exactas pendientes (~500); priorizamos las más próximas.
    todas.sort((a, b) => a.schedule.at - b.schedule.at);
    const lote = todas.slice(0, 400);
    if (lote.length) await LocalNotifications.schedule({ notifications: lote });
  } catch (e) {
    console.warn('No se pudieron reprogramar alarmas:', e);
  }
}

async function avisoAlAbrir() {
  const urgentes = productosCache.filter((p) => diasRestantes(p.fecha_vencimiento) <= 1);
  if (!urgentes.length) return;
  const cuerpo = urgentes.slice(0, 5).map((p) => {
    const d = diasRestantes(p.fecha_vencimiento);
    if (d < 0) return `"${p.nombre}" ya venció`;
    if (d === 0) return `"${p.nombre}" vence HOY`;
    return `"${p.nombre}" vence mañana`;
  }).join('. ');
  if (esNativo) {
    await LocalNotifications.schedule({
      notifications: [{
        id: 1,
        title: '📦 Revisa tus productos',
        body: cuerpo,
        schedule: { at: new Date(Date.now() + 3000) },
      }],
    });
  } else if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('📦 Revisa tus productos', { body: cuerpo });
  }
}

// ---------- Foto ----------
function redimensionarFoto(archivo, maxLado = 700) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(archivo);
    img.onload = () => {
      const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ---------- Vista: productos ----------
function estadoProducto(dias) {
  if (dias < 0) return { clase: 'estado-vencido', texto: `❌ Vencido hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? '' : 's'}` };
  if (dias === 0) return { clase: 'estado-hoy', texto: '🚨 ¡Vence HOY!' };
  if (dias === 1) return { clase: 'estado-pronto', texto: '⚠️ Vence MAÑANA' };
  if (dias <= 7) return { clase: 'estado-cerca', texto: `⏳ Vence en ${dias} días` };
  return { clase: 'estado-ok', texto: `✅ Vence en ${dias} días` };
}

function pintarChips() {
  const cont = $('#filtro-categorias');
  cont.innerHTML = '';
  const conteos = {};
  productosCache.forEach((p) => { conteos[p.categoria] = (conteos[p.categoria] || 0) + 1; });

  ['Todos', ...CATEGORIAS].forEach((cat) => {
    const chip = document.createElement('button');
    chip.className = 'chip' + (filtroCategoria === cat ? ' activa' : '');
    const n = cat === 'Todos' ? productosCache.length : (conteos[cat] || 0);
    chip.textContent = n ? `${cat} (${n})` : cat;
    chip.addEventListener('click', () => {
      filtroCategoria = cat;
      pintarChips();
      pintarLista();
    });
    cont.appendChild(chip);
  });
}

function pintarLista() {
  const productos = filtroCategoria === 'Todos'
    ? productosCache
    : productosCache.filter((p) => p.categoria === filtroCategoria);

  const lista = $('#lista-productos');
  lista.innerHTML = '';
  $('#mensaje-vacio').classList.toggle('oculto', productos.length > 0);

  const vencidos = productosCache.filter((p) => diasRestantes(p.fecha_vencimiento) < 0).length;
  const porVencer = productosCache.filter((p) => {
    const d = diasRestantes(p.fecha_vencimiento);
    return d >= 0 && d <= 1;
  }).length;

  $('#resumen').classList.toggle('oculto', !vencidos && !porVencer);
  $('#resumen-vencidos').classList.toggle('oculto', !vencidos);
  $('#resumen-porvencer').classList.toggle('oculto', !porVencer);
  if (vencidos) $('#resumen-vencidos').textContent = `❌ ${vencidos} producto${vencidos === 1 ? '' : 's'} vencido${vencidos === 1 ? '' : 's'} — retíralo${vencidos === 1 ? '' : 's'}`;
  if (porVencer) $('#resumen-porvencer').textContent = `⚠️ ${porVencer} producto${porVencer === 1 ? '' : 's'} vence${porVencer === 1 ? '' : 'n'} hoy o mañana`;

  for (const p of productos) {
    const dias = diasRestantes(p.fecha_vencimiento);
    const { clase, texto } = estadoProducto(dias);
    const tarjeta = document.createElement('div');
    tarjeta.className = `tarjeta ${clase}`;
    tarjeta.innerHTML = `
      <img alt="" />
      <div class="info">
        <div class="nombre"></div>
        <span class="categoria"></span>
        <div class="fecha">Vence: ${formatearFecha(p.fecha_vencimiento)}</div>
        <div class="estado">${texto}</div>
      </div>
      <div class="acciones">
        <button class="btn-retirar">✅ Retirar</button>
        <button class="btn-borrar" title="Eliminar">🗑️</button>
      </div>
    `;
    tarjeta.querySelector('img').src = p.foto || '';
    tarjeta.querySelector('.nombre').textContent = p.nombre;
    tarjeta.querySelector('.categoria').textContent = p.categoria;
    tarjeta.querySelector('img').addEventListener('click', () => {
      if (!p.foto) return;
      $('#foto-ampliada').src = p.foto;
      $('#modal-foto').classList.remove('oculto');
    });
    tarjeta.querySelector('.btn-retirar').addEventListener('click', () => retirarProducto(p));
    tarjeta.querySelector('.btn-borrar').addEventListener('click', () => eliminarProducto(p));
    lista.appendChild(tarjeta);
  }
}

function abrirFormulario() {
  $('#foto-preview').src = fotoPendiente;
  $('#input-nombre').value = '';
  const manana = new Date(Date.now() + 86400000);
  $('#input-fecha').value = fechaLocalISO(manana);
  $('#input-fecha').min = fechaLocalISO(new Date());
  $('#modal-form').classList.remove('oculto');
  setTimeout(() => $('#input-nombre').focus(), 100);
}

// ---------- Vista: dashboard ----------
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];
const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
let anioDashboard = new Date().getFullYear();
let mesSeleccionado = new Date().getMonth();
let activosDashboard = [];

// Cuadrícula de los 12 meses con la cantidad de productos que vencen en cada uno.
function pintarMeses() {
  $('#anio-actual').textContent = anioDashboard;
  const grid = $('#grid-meses');
  grid.innerHTML = '';

  const porMes = Array(12).fill(0);
  activosDashboard.forEach((p) => {
    const f = parsearFecha(p.fecha_vencimiento);
    if (f.getFullYear() === anioDashboard) porMes[f.getMonth()]++;
  });

  MESES.forEach((nombre, i) => {
    const celda = document.createElement('div');
    celda.className = 'mes-celda'
      + (porMes[i] > 0 ? ' con-productos' : '')
      + (i === mesSeleccionado ? ' seleccionado' : '');
    celda.innerHTML = `<div class="mes-nombre">${nombre}</div><div class="mes-cuenta">${porMes[i]}</div>`;
    celda.addEventListener('click', () => {
      mesSeleccionado = i;
      pintarMeses();
      pintarDetalleMes();
    });
    grid.appendChild(celda);
  });
}

// Detalle del mes elegido: cuántos productos vencen por área (categoría).
function pintarDetalleMes() {
  $('#titulo-detalle-mes').textContent =
    `Por área — vencen en ${MESES_LARGO[mesSeleccionado]} ${anioDashboard}`;
  const porCategoria = {};
  activosDashboard.forEach((p) => {
    const f = parsearFecha(p.fecha_vencimiento);
    if (f.getFullYear() === anioDashboard && f.getMonth() === mesSeleccionado) {
      porCategoria[p.categoria] = (porCategoria[p.categoria] || 0) + 1;
    }
  });
  pintarBarras('#detalle-mes', porCategoria);
  if (!Object.keys(porCategoria).length) {
    $('#detalle-mes').innerHTML = '<p class="ayuda">Ningún producto vence este mes. 🎉</p>';
  }
}

function pintarBarras(contenedor, conteos) {
  const cont = $(contenedor);
  cont.innerHTML = '';
  const entradas = Object.entries(conteos).sort((a, b) => b[1] - a[1]);
  if (!entradas.length) {
    cont.innerHTML = '<p class="ayuda">Todavía no hay retiros registrados.</p>';
    return;
  }
  const max = entradas[0][1];
  for (const [etiqueta, valor] of entradas) {
    const fila = document.createElement('div');
    fila.className = 'barra-fila';
    fila.innerHTML = `
      <div class="barra-info"><span class="etiqueta"></span><span class="valor">${valor}</span></div>
      <div class="barra-fondo"><div class="barra-relleno" style="width:${Math.round((valor / max) * 100)}%"></div></div>
    `;
    fila.querySelector('.etiqueta').textContent = etiqueta;
    cont.appendChild(fila);
  }
}

async function pintarDashboard() {
  // Productos activos (para el control anual de vencimientos por área)
  const { data: activos, error: errorActivos } = await sb
    .from('productos')
    .select('categoria, fecha_vencimiento')
    .eq('retirado', false);
  if (errorActivos) { alert('No se pudo cargar el dashboard: ' + errorActivos.message); return; }
  activosDashboard = activos || [];
  pintarMeses();
  pintarDetalleMes();

  // Productos ya retirados (estadísticas de retiros)
  const { data, error } = await sb
    .from('productos')
    .select('nombre, categoria, foto, retirado_en, retirado_por_nombre')
    .eq('retirado', true)
    .order('retirado_en', { ascending: false });

  if (error) { alert('No se pudo cargar el dashboard: ' + error.message); return; }
  const retiros = data || [];

  const ahora = new Date();
  const inicioHoy = hoySinHora();
  const hace7 = new Date(inicioHoy); hace7.setDate(hace7.getDate() - 6);
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);

  const en = (r, desde) => new Date(r.retirado_en) >= desde;
  $('#kpi-hoy').textContent = retiros.filter((r) => en(r, inicioHoy)).length;
  $('#kpi-semana').textContent = retiros.filter((r) => en(r, hace7)).length;
  $('#kpi-mes').textContent = retiros.filter((r) => en(r, inicioMes)).length;
  $('#kpi-total').textContent = retiros.length;

  const porCategoria = {};
  const porUsuario = {};
  retiros.forEach((r) => {
    porCategoria[r.categoria] = (porCategoria[r.categoria] || 0) + 1;
    const u = r.retirado_por_nombre || '(sin nombre)';
    porUsuario[u] = (porUsuario[u] || 0) + 1;
  });
  pintarBarras('#grafico-categorias', porCategoria);
  pintarBarras('#grafico-usuarios', porUsuario);

  const hist = $('#historial-retiros');
  hist.innerHTML = '';
  if (!retiros.length) {
    hist.innerHTML = '<p class="ayuda">Cuando retires un producto aparecerá aquí.</p>';
  }
  for (const r of retiros.slice(0, 20)) {
    const item = document.createElement('div');
    item.className = 'retiro-item';
    const fecha = new Date(r.retirado_en).toLocaleDateString('es-PE', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
    item.innerHTML = `
      <img alt="" />
      <div class="detalle">
        <div><strong class="r-nombre"></strong> · <span class="r-cat"></span></div>
        <div class="quien"></div>
      </div>
    `;
    item.querySelector('img').src = r.foto || '';
    item.querySelector('.r-nombre').textContent = r.nombre;
    item.querySelector('.r-cat').textContent = r.categoria;
    item.querySelector('.quien').textContent = `${r.retirado_por_nombre || ''} — ${fecha}`;
    hist.appendChild(item);
  }
}

// ---------- Vista: admin (usuarios) ----------
async function pintarUsuarios() {
  const { data, error } = await sb
    .from('perfiles')
    .select('*')
    .order('creado_en', { ascending: false });

  if (error) { alert('No se pudieron cargar los usuarios: ' + error.message); return; }

  const cont = $('#lista-usuarios');
  cont.innerHTML = '';
  for (const u of data || []) {
    const fila = document.createElement('div');
    fila.className = 'usuario-fila';
    const esYo = u.id === perfilActual.id;
    fila.innerHTML = `
      <div class="datos">
        <div class="nombre-u"></div>
        <div class="email-u"></div>
        <span class="pill ${u.es_admin ? 'admin' : (u.aprobado ? 'si' : 'no')}">
          ${u.es_admin ? 'ADMIN' : (u.aprobado ? 'CON ACCESO' : 'SIN ACCESO')}
        </span>
      </div>
    `;
    fila.querySelector('.nombre-u').textContent = (u.nombre || '(sin nombre)') + (esYo ? ' (tú)' : '');
    fila.querySelector('.email-u').textContent = u.email;

    if (!u.es_admin) {
      const btn = document.createElement('button');
      btn.className = 'btn-acceso ' + (u.aprobado ? 'quitar' : 'dar');
      btn.textContent = u.aprobado ? 'Quitar acceso' : 'Dar acceso';
      btn.addEventListener('click', async () => {
        const { error: e } = await sb.from('perfiles')
          .update({ aprobado: !u.aprobado })
          .eq('id', u.id);
        if (e) { alert('No se pudo cambiar el acceso: ' + e.message); return; }
        pintarUsuarios();
      });
      fila.appendChild(btn);
    }
    cont.appendChild(fila);
  }
}

// ---------- Inicio ----------
function conectarEventos() {
  $('#btn-login').addEventListener('click', entrarORegistrar);
  $('#login-password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') entrarORegistrar();
  });
  $('#btn-cambiar-modo').addEventListener('click', alternarModoLogin);
  $('#btn-reintentar').addEventListener('click', arrancarSesion);
  $('#btn-salir-espera').addEventListener('click', cerrarSesion);
  $('#btn-logout').addEventListener('click', () => {
    if (confirm('¿Cerrar sesión?')) cerrarSesion();
  });

  document.querySelectorAll('.tab').forEach((t) => {
    t.addEventListener('click', () => mostrarVista(t.dataset.tab));
  });

  $('#anio-prev').addEventListener('click', () => {
    anioDashboard--;
    pintarMeses();
    pintarDetalleMes();
  });
  $('#anio-next').addEventListener('click', () => {
    anioDashboard++;
    pintarMeses();
    pintarDetalleMes();
  });

  const selCat = $('#input-categoria');
  CATEGORIAS.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    selCat.appendChild(opt);
  });

  $('#btn-agregar').addEventListener('click', () => $('#input-camara').click());
  $('#input-camara').addEventListener('change', async (e) => {
    const archivo = e.target.files[0];
    e.target.value = '';
    if (!archivo) return;
    try {
      fotoPendiente = await redimensionarFoto(archivo);
      abrirFormulario();
    } catch (_) {
      alert('No se pudo procesar la foto. Intenta de nuevo.');
    }
  });

  $('#btn-guardar').addEventListener('click', guardarNuevoProducto);
  $('#btn-cancelar').addEventListener('click', () => {
    fotoPendiente = null;
    $('#modal-form').classList.add('oculto');
  });
  $('#btn-cerrar-foto').addEventListener('click', () => $('#modal-foto').classList.add('oculto'));

  // Al volver a la app se refrescan los datos.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && perfilActual && perfilActual.aprobado) cargarProductos();
  });
}

async function iniciar() {
  conectarEventos();

  if (!configValida()) { mostrarPantalla('pantalla-config'); return; }

  sb = window.supabase.createClient(
    window.CONFIG_NUBE.SUPABASE_URL,
    window.CONFIG_NUBE.SUPABASE_ANON_KEY,
  );

  await arrancarSesion();
}

iniciar();
