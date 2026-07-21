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
let filtroProveedor = 'Todos';
let textoBusqueda = '';
let fotoPendiente = null;
let productoEditando = null; // null = creando producto nuevo
let productosCache = [];
let retirosCache = [];

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
  $('#btn-escanear').classList.toggle('oculto', nombre !== 'productos');
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

async function guardarProducto() {
  const nombre = $('#input-nombre').value.trim();
  const fecha = $('#input-fecha').value;
  const categoria = $('#input-categoria').value;
  const cantidad = Math.max(1, Math.round(Number($('#input-cantidad').value) || 1));
  const precio = Math.max(0, Number($('#input-precio').value) || 0);
  const proveedor = $('#input-proveedor').value.trim();
  if (!nombre) { alert('Escribe el nombre del producto.'); return; }
  if (!fecha) { alert('Elige la fecha de vencimiento.'); return; }

  $('#btn-guardar').disabled = true;
  $('#btn-guardar').textContent = 'Guardando…';
  try {
    const payload = {
      nombre,
      categoria,
      cantidad,
      precio,
      proveedor,
      fecha_vencimiento: fecha,
      anticipacion: Number($('#input-anticipacion').value),
    };

    // Reintenta quitando columnas que aún no existan en la base (precio/proveedor/cantidad).
    const guardar = async () => {
      const p = { ...payload };
      for (let intento = 0; intento < 4; intento++) {
        let r;
        if (productoEditando) {
          r = await sb.from('productos').update(p).eq('id', productoEditando.id).select().single();
        } else {
          r = await sb.from('productos').insert(p).select().single();
        }
        if (!r.error) return r;
        const faltante = ['precio', 'proveedor', 'cantidad'].find((c) => new RegExp(c).test(r.error.message));
        if (faltante && faltante in p) { delete p[faltante]; continue; }
        return r;
      }
      return { error: { message: 'No se pudo guardar tras varios intentos' } };
    };

    if (!productoEditando) {
      payload.foto = fotoPendiente;
      payload.creado_por = perfilActual.id;
      payload.creado_por_nombre = perfilActual.nombre || perfilActual.email;
    }

    const { data, error } = await guardar();
    if (error) { alert('No se pudo guardar: ' + error.message); return; }

    // Si vino de un escaneo, memoriza el código para futuros escaneos.
    if (codigoEscaneado) {
      const entrada = {
        codigo: codigoEscaneado,
        nombre, categoria, proveedor, precio,
        foto: data.foto || fotoPendiente || null,
      };
      let res = await sb.from('catalogo').upsert(entrada);
      // Reintenta sin precio/proveedor si esas columnas del catálogo no existen.
      if (res && res.error && /(precio|proveedor)/.test(res.error.message)) {
        delete entrada.precio; delete entrada.proveedor;
        await sb.from('catalogo').upsert(entrada);
      }
      codigoEscaneado = null;
    }

    await cancelarAlarmas(data.id);
    await programarAlarmas(data);
    fotoPendiente = null;
    productoEditando = null;
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

  const etiqueta = (p.cantidad > 1 ? `${p.cantidad} × ` : '') + p.nombre;
  const ahora = new Date();
  const lista = [];
  if (fechaAviso > ahora) {
    lista.push({
      id: idAviso,
      title: '⚠️ Producto por vencer',
      body: `"${etiqueta}" (${p.categoria}) vence ${p.anticipacion === 1 ? 'MAÑANA' : `en ${p.anticipacion} días`} (${formatearFecha(p.fecha_vencimiento)}). ¡Revísalo!`,
      schedule: { at: fechaAviso, allowWhileIdle: true },
    });
  }
  if (fechaVence > ahora) {
    lista.push({
      id: idVence,
      title: '🚨 ¡Producto vence HOY!',
      body: `"${etiqueta}" (${p.categoria}) vence hoy. Retíralo del stock.`,
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
    const lote = todas.slice(0, 380);

    // Resumen diario a las 9:00 pm (hora del teléfono) para los próximos 7 días:
    // "Mañana vencen N productos". Solo se programa si ese día hay algo que avisar.
    const ahora = new Date();
    for (let d = 0; d < 7; d++) {
      const dia = new Date();
      dia.setDate(dia.getDate() + d);
      dia.setHours(21, 0, 0, 0);
      if (dia <= ahora) continue;
      const fechaManana = fechaLocalISO(new Date(dia.getFullYear(), dia.getMonth(), dia.getDate() + 1));
      const vencenManana = productosCache.filter((p) => p.fecha_vencimiento === fechaManana);
      if (!vencenManana.length) continue;
      const unidades = vencenManana.reduce((s, p) => s + (p.cantidad || 1), 0);
      const nombres = vencenManana.slice(0, 4).map((p) => p.nombre).join(', ')
        + (vencenManana.length > 4 ? '…' : '');
      lote.push({
        id: 2000000001 + d, // ids reservados para el resumen diario
        title: `🔔 Mañana vence${vencenManana.length === 1 ? '' : 'n'} ${vencenManana.length} producto${vencenManana.length === 1 ? '' : 's'} (${unidades} und.)`,
        body: `${nombres}. Revísalos y retíralos a tiempo.`,
        schedule: { at: dia, allowWhileIdle: true },
      });
    }

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

// ---------- Escáner de código de barras ----------
let escaner = null;
let codigoEscaneado = null; // código pendiente de memorizar al guardar

async function abrirEscaner() {
  $('#modal-escaner').classList.remove('oculto');
  $('#estado-escaner').textContent = 'Apunta la cámara al código de barras del producto…';
  try {
    escaner = new Html5Qrcode('lector-codigo');
    await escaner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 260, height: 140 } },
      async (codigo) => {
        await cerrarEscaner();
        buscarCodigoDeBarras(codigo);
      },
      () => {}, // fotogramas sin código: ignorar
    );
  } catch (e) {
    $('#estado-escaner').textContent =
      '⚠️ No se pudo abrir la cámara. Revisa que la app tenga el permiso de cámara. ' + (e.message || e);
  }
}

async function cerrarEscaner() {
  if (escaner) {
    try { await escaner.stop(); escaner.clear(); } catch (_) { /* ya detenido */ }
    escaner = null;
  }
  $('#modal-escaner').classList.add('oculto');
}

// Al escanear: 1) busca en el catálogo propio de la bodega, 2) en la base
// pública Open Food Facts, 3) si no está en ninguna, registro manual con foto.
// El código queda pendiente para memorizarse al guardar (crece el catálogo).
async function buscarCodigoDeBarras(codigo) {
  codigoEscaneado = codigo;

  // 1) Catálogo propio (lo que la bodega ya registró antes)
  try {
    const { data } = await sb.from('catalogo').select('*').eq('codigo', codigo).limit(1);
    if (data && data[0]) {
      abrirFormulario(null, {
        nombre: data[0].nombre,
        foto: data[0].foto || null,
        categoria: data[0].categoria || CATEGORIAS[0],
        proveedor: data[0].proveedor || '',
        precio: data[0].precio || 0,
        cantidad: 1,
        anticipacion: 1,
      });
      return;
    }
  } catch (_) { /* la tabla catalogo puede no existir aún: seguimos */ }

  // 2) Base pública mundial
  try {
    const r = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(codigo)}.json?fields=product_name,product_name_es,generic_name,brands,image_front_url,image_url`,
    );
    const j = await r.json();
    if (j.status === 1 && j.product) {
      const p = j.product;
      const base = p.product_name_es || p.product_name || p.generic_name || '';
      const nombre = [base, p.brands ? `(${p.brands.split(',')[0].trim()})` : '']
        .filter(Boolean).join(' ').trim();
      abrirFormulario(null, {
        nombre,
        foto: p.image_front_url || p.image_url || null,
        cantidad: 1,
        categoria: CATEGORIAS[0],
        anticipacion: 1,
      });
      return;
    }
  } catch (_) { /* sin internet o API caída: pasar al registro manual */ }

  // 3) No está en ninguna base: registro manual. Al guardarlo, la app aprende
  // este código y la próxima vez que se escanee saldrá automáticamente.
  alert(`Producto nuevo (código ${codigo}).\nTómale una foto y complétalo una vez; la app lo recordará para los próximos escaneos.`);
  $('#input-camara').click();
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

  // Chips de proveedor (solo si hay productos con proveedor registrado)
  const contProv = $('#filtro-proveedores');
  contProv.innerHTML = '';
  const proveedores = [...new Set(productosCache.map((p) => (p.proveedor || '').trim()).filter(Boolean))].sort();
  if (proveedores.length) {
    if (!['Todos', ...proveedores].includes(filtroProveedor)) filtroProveedor = 'Todos';
    ['Todos', ...proveedores].forEach((prov) => {
      const chip = document.createElement('button');
      chip.className = 'chip' + (filtroProveedor === prov ? ' activa' : '');
      chip.textContent = prov === 'Todos' ? '🏷️ Todos' : prov;
      chip.addEventListener('click', () => {
        filtroProveedor = prov;
        pintarChips();
        pintarLista();
      });
      contProv.appendChild(chip);
    });
  } else {
    filtroProveedor = 'Todos';
  }

  // Autocompletado de proveedores en el formulario
  const dl = $('#lista-proveedores');
  if (dl) dl.innerHTML = proveedores.map((p) => `<option value="${p.replace(/"/g, '&quot;')}"></option>`).join('');
}

function normalizar(t) {
  return (t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function pintarLista() {
  let productos = filtroCategoria === 'Todos'
    ? productosCache
    : productosCache.filter((p) => p.categoria === filtroCategoria);
  if (filtroProveedor !== 'Todos') {
    productos = productos.filter((p) => (p.proveedor || '').trim() === filtroProveedor);
  }
  if (textoBusqueda) {
    productos = productos.filter((p) => normalizar(p.nombre).includes(normalizar(textoBusqueda)));
  }

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
    const unidades = p.cantidad || 1;
    tarjeta.innerHTML = `
      <img alt="" />
      <div class="info">
        <div class="nombre"><span class="nombre-texto"></span><span class="cantidad-badge">${unidades} und.</span></div>
        <span class="categoria"></span>
        <div class="fecha">Vence: ${formatearFecha(p.fecha_vencimiento)}</div>
        <div class="estado">${texto}</div>
      </div>
      <div class="acciones">
        <button class="btn-retirar">✅ Retirar</button>
        <div class="fila-iconos">
          <button class="btn-duplicar" title="Nuevo lote (misma foto y nombre, otra fecha)">📋</button>
          <button class="btn-editar" title="Editar">✏️</button>
          <button class="btn-borrar" title="Eliminar">🗑️</button>
        </div>
      </div>
    `;
    tarjeta.querySelector('img').src = p.foto || '';
    tarjeta.querySelector('.nombre-texto').textContent = p.nombre;
    tarjeta.querySelector('.categoria').textContent = p.categoria;
    tarjeta.querySelector('img').addEventListener('click', () => {
      if (!p.foto) return;
      $('#foto-ampliada').src = p.foto;
      $('#modal-foto').classList.remove('oculto');
    });
    tarjeta.querySelector('.btn-retirar').addEventListener('click', () => retirarProducto(p));
    tarjeta.querySelector('.btn-duplicar').addEventListener('click', () => abrirFormulario(null, p));
    tarjeta.querySelector('.btn-editar').addEventListener('click', () => abrirFormulario(p));
    tarjeta.querySelector('.btn-borrar').addEventListener('click', () => eliminarProducto(p));
    lista.appendChild(tarjeta);
  }

  actualizarCampana();
}

// ---------- Campana de avisos ----------
// Junta los productos vencidos o que vencen en los próximos 7 días.
function productosDeCampana() {
  return productosCache
    .filter((p) => diasRestantes(p.fecha_vencimiento) <= 7)
    .sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento));
}

function actualizarCampana() {
  const n = productosDeCampana().length;
  const badge = $('#campana-contador');
  badge.textContent = n > 9 ? '9+' : n;
  badge.classList.toggle('oculto', n === 0);
}

function abrirCampana() {
  const items = productosDeCampana();
  const cont = $('#lista-campana');
  cont.innerHTML = '';
  if (!items.length) {
    cont.innerHTML = '<p class="ayuda">✅ Nada por vencer en los próximos 7 días.</p>';
  }
  for (const p of items) {
    const dias = diasRestantes(p.fecha_vencimiento);
    let clase = 'cm-semana', texto;
    if (dias < 0) { clase = 'cm-vencido'; texto = `Vencido hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? '' : 's'}`; }
    else if (dias === 0) { clase = 'cm-hoy'; texto = '¡Vence HOY!'; }
    else if (dias === 1) { clase = 'cm-manana'; texto = 'Vence mañana'; }
    else texto = `Vence en ${dias} días`;

    const item = document.createElement('div');
    item.className = 'campana-item';
    item.innerHTML = `
      <img alt="" />
      <div class="cm-info">
        <div class="cm-nombre"></div>
        <div class="cm-estado ${clase}"></div>
      </div>
    `;
    item.querySelector('img').src = p.foto || '';
    item.querySelector('.cm-nombre').textContent = `${p.cantidad || 1} × ${p.nombre}`;
    item.querySelector('.cm-estado').textContent = `${texto} · ${formatearFecha(p.fecha_vencimiento)}`;
    cont.appendChild(item);
  }
  $('#modal-campana').classList.remove('oculto');
}

// producto = editar ese producto; plantilla = crear uno nuevo con datos precargados
// (nuevo lote de un producto existente, o datos que llegan del escáner).
function abrirFormulario(producto = null, plantilla = null) {
  productoEditando = producto;
  const base = producto || plantilla;
  if (plantilla) fotoPendiente = plantilla.foto || null;
  $('#titulo-modal').textContent = producto ? 'Editar producto' : (plantilla ? 'Nuevo lote' : 'Nuevo producto');
  $('#foto-preview').src = (producto ? producto.foto : fotoPendiente) || '';
  $('#input-nombre').value = base ? base.nombre : '';
  $('#input-cantidad').value = base ? (base.cantidad || 1) : 1;
  $('#input-precio').value = base && base.precio ? base.precio : '';
  $('#input-proveedor').value = base ? (base.proveedor || '') : '';
  $('#input-categoria').value = base ? base.categoria : CATEGORIAS[0];
  $('#input-anticipacion').value = base ? String(base.anticipacion || 1) : '1';
  const manana = new Date(Date.now() + 86400000);
  $('#input-fecha').value = producto ? producto.fecha_vencimiento : fechaLocalISO(manana);
  $('#input-fecha').min = producto ? '' : fechaLocalISO(new Date());
  $('#modal-form').classList.remove('oculto');
  setTimeout(() => $('#input-nombre').focus(), 100);
}

// ---------- Vista: dashboard ----------
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];
const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
let anioDashboard = new Date().getFullYear();
let mesSeleccionado = new Date().getMonth();
let activosDashboard = [];
let filtroDesde = '';
let filtroHasta = '';

// Cambia el mes visible (las flechas ‹ › ajustan también el año).
function moverMes(direccion) {
  mesSeleccionado += direccion;
  if (mesSeleccionado < 0) { mesSeleccionado = 11; anioDashboard--; }
  if (mesSeleccionado > 11) { mesSeleccionado = 0; anioDashboard++; }
  pintarDetalleMes();
}

// Detalle del mes elegido: cuántas unidades vencen por área (categoría).
function pintarDetalleMes() {
  const nombreMes = MESES_LARGO[mesSeleccionado];
  $('#mes-actual').textContent =
    `${nombreMes.charAt(0).toUpperCase()}${nombreMes.slice(1)} ${anioDashboard}`;

  const delMes = activosDashboard.filter((p) => {
    const f = parsearFecha(p.fecha_vencimiento);
    return f.getFullYear() === anioDashboard && f.getMonth() === mesSeleccionado;
  });

  const porCategoria = {};
  let unidades = 0;
  delMes.forEach((p) => {
    const n = p.cantidad || 1;
    porCategoria[p.categoria] = (porCategoria[p.categoria] || 0) + n;
    unidades += n;
  });

  $('#resumen-mes').textContent = delMes.length
    ? `${delMes.length} producto${delMes.length === 1 ? '' : 's'} (${unidades} unidad${unidades === 1 ? '' : 'es'}) vence${delMes.length === 1 ? '' : 'n'} este mes, por área:`
    : 'Ningún producto vence en este mes. 🎉';

  pintarBarras('#detalle-mes', porCategoria);
  if (!delMes.length) $('#detalle-mes').innerHTML = '';
}

function pintarBarras(contenedor, conteos, formato = null) {
  const cont = $(contenedor);
  cont.innerHTML = '';
  const entradas = Object.entries(conteos).sort((a, b) => b[1] - a[1]);
  if (!entradas.length) {
    cont.innerHTML = '<p class="ayuda">Todavía no hay datos.</p>';
    return;
  }
  const max = entradas[0][1];
  for (const [etiqueta, valor] of entradas) {
    const fila = document.createElement('div');
    fila.className = 'barra-fila';
    fila.innerHTML = `
      <div class="barra-info"><span class="etiqueta"></span><span class="valor"></span></div>
      <div class="barra-fondo"><div class="barra-relleno" style="width:${Math.round((valor / max) * 100)}%"></div></div>
    `;
    fila.querySelector('.etiqueta').textContent = etiqueta;
    fila.querySelector('.valor').textContent = formato ? formato(valor) : valor;
    cont.appendChild(fila);
  }
}

async function pintarDashboard() {
  // Productos activos (para el control anual de vencimientos por área)
  const { data: activos, error: errorActivos } = await sb
    .from('productos')
    .select('*')
    .eq('retirado', false);
  if (errorActivos) { alert('No se pudo cargar el dashboard: ' + errorActivos.message); return; }
  activosDashboard = activos || [];
  pintarDetalleMes();

  // Productos ya retirados (estadísticas de retiros, contando unidades)
  const { data, error } = await sb
    .from('productos')
    .select('*')
    .eq('retirado', true)
    .order('retirado_en', { ascending: false });

  if (error) { alert('No se pudo cargar el dashboard: ' + error.message); return; }
  const retiros = data || [];
  retirosCache = retiros;
  $('#btn-exportar').classList.toggle('oculto', esNativo || !retiros.length);

  const ahora = new Date();
  const inicioHoy = hoySinHora();
  const hace7 = new Date(inicioHoy); hace7.setDate(hace7.getDate() - 6);
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);

  const unidades = (lista) => lista.reduce((s, r) => s + (r.cantidad || 1), 0);
  const en = (r, desde) => new Date(r.retirado_en) >= desde;
  $('#kpi-hoy').textContent = unidades(retiros.filter((r) => en(r, inicioHoy)));
  $('#kpi-semana').textContent = unidades(retiros.filter((r) => en(r, hace7)));
  $('#kpi-mes').textContent = unidades(retiros.filter((r) => en(r, inicioMes)));
  $('#kpi-total').textContent = unidades(retiros);

  const porCategoria = {};
  const porUsuario = {};
  retiros.forEach((r) => {
    const n = r.cantidad || 1;
    porCategoria[r.categoria] = (porCategoria[r.categoria] || 0) + n;
    const u = r.retirado_por_nombre || '(sin nombre)';
    porUsuario[u] = (porUsuario[u] || 0) + n;
  });
  pintarBarras('#grafico-categorias', porCategoria);
  pintarBarras('#grafico-usuarios', porUsuario);

  // ----- Pérdida en S/ -----
  const valor = (r) => (r.precio || 0) * (r.cantidad || 1);
  const retiradosMes = retiros.filter((r) => en(r, inicioMes));
  const perdidaMes = retiradosMes.reduce((s, r) => s + valor(r), 0);

  // "En riesgo": productos activos que vencen dentro del mes calendario actual.
  const finMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0);
  const enRiesgo = activosDashboard
    .filter((p) => {
      const f = parsearFecha(p.fecha_vencimiento);
      return f >= inicioHoy && f <= finMes;
    })
    .reduce((s, p) => s + (p.precio || 0) * (p.cantidad || 1), 0);

  $('#kpi-perdida-mes').textContent = soles(perdidaMes);
  $('#kpi-riesgo').textContent = soles(enRiesgo);

  const perdidaPorCategoria = {};
  retiradosMes.forEach((r) => {
    const v = valor(r);
    if (v > 0) perdidaPorCategoria[r.categoria] = (perdidaPorCategoria[r.categoria] || 0) + v;
  });
  pintarBarras('#grafico-perdida', perdidaPorCategoria, soles);
  if (!Object.keys(perdidaPorCategoria).length) {
    $('#grafico-perdida').innerHTML = '<p class="ayuda">Aún no hay pérdidas con precio registrado este mes. Agrega el precio a los productos para ver el monto en S/.</p>';
  }

  pintarHistorial();
}

function soles(n) {
  return 'S/ ' + (Math.round(n * 100) / 100).toLocaleString('es-PE', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
}

// Retiros dentro del rango de fechas elegido (o todos si no hay filtro).
function retirosFiltrados() {
  return retirosCache.filter((r) => {
    const f = new Date(r.retirado_en);
    if (filtroDesde && f < parsearFecha(filtroDesde)) return false;
    if (filtroHasta) {
      const h = parsearFecha(filtroHasta);
      h.setHours(23, 59, 59, 999);
      if (f > h) return false;
    }
    return true;
  });
}

// Devuelve un producto retirado a la lista de activos (deshacer).
async function devolverRetiro(r) {
  if (!confirm(`¿Devolver "${r.nombre}" a la lista de productos?`)) return;
  const { error } = await sb.from('productos').update({
    retirado: false,
    retirado_en: null,
    retirado_por_nombre: null,
  }).eq('id', r.id);
  if (error) { alert('No se pudo deshacer: ' + error.message); return; }
  await programarAlarmas(r);
  await cargarProductos();
  pintarDashboard();
}

function pintarHistorial() {
  const hayFiltro = !!(filtroDesde || filtroHasta);
  $('#btn-limpiar-filtro').classList.toggle('oculto', !hayFiltro);
  const lista = retirosFiltrados();

  const hist = $('#historial-retiros');
  hist.innerHTML = '';
  if (!lista.length) {
    hist.innerHTML = `<p class="ayuda">${hayFiltro ? 'No hay retiros en ese rango de fechas.' : 'Cuando retires un producto aparecerá aquí.'}</p>`;
    return;
  }
  // Sin filtro se muestran los últimos 20; con filtro, todos los del rango.
  for (const r of (hayFiltro ? lista : lista.slice(0, 20))) {
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
      <button class="btn-deshacer" title="Devolver a la lista">↩️</button>
    `;
    item.querySelector('img').src = r.foto || '';
    item.querySelector('.r-nombre').textContent = `${r.cantidad || 1} × ${r.nombre}`;
    item.querySelector('.r-cat').textContent = r.categoria;
    item.querySelector('.quien').textContent = `${r.retirado_por_nombre || ''} — ${fecha}`;
    item.querySelector('.btn-deshacer').addEventListener('click', () => devolverRetiro(r));
    hist.appendChild(item);
  }
}

// Descarga el historial de retiros como CSV (se abre en Excel).
function exportarRetiros() {
  const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const filas = [
    ['Producto', 'Cantidad', 'Precio unit. (S/)', 'Valor (S/)', 'Categoría', 'Proveedor', 'Fecha de vencimiento', 'Retirado por', 'Fecha de retiro'],
    ...retirosFiltrados().map((r) => [
      r.nombre,
      r.cantidad || 1,
      r.precio || 0,
      (r.precio || 0) * (r.cantidad || 1),
      r.categoria,
      r.proveedor || '',
      r.fecha_vencimiento,
      r.retirado_por_nombre || '',
      new Date(r.retirado_en).toLocaleString('es-PE'),
    ]),
  ];
  const csv = '﻿' + filas.map((f) => f.map(esc).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `retiros-${fechaLocalISO(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Genera un reporte PDF del mes visible: resumen, pérdidas por área y lista de retiros.
function generarReportePDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const ancho = doc.internal.pageSize.getWidth();
  const margen = 40;
  let y = margen;

  const nombreMes = MESES_LARGO[mesSeleccionado];
  const tituloMes = `${nombreMes.charAt(0).toUpperCase()}${nombreMes.slice(1)} ${anioDashboard}`;

  // Encabezado
  doc.setFillColor(15, 118, 110);
  doc.rect(0, 0, ancho, 70, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Control de Vencimientos', margen, 34);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`Reporte de ${tituloMes}`, margen, 52);
  doc.setFontSize(9);
  doc.text(`Generado: ${new Date().toLocaleString('es-PE')}`, ancho - margen, 52, { align: 'right' });
  y = 96;
  doc.setTextColor(30, 30, 30);

  // Retiros del mes visible
  const inicio = new Date(anioDashboard, mesSeleccionado, 1);
  const fin = new Date(anioDashboard, mesSeleccionado + 1, 0, 23, 59, 59);
  const retirosMes = retirosCache.filter((r) => {
    const f = new Date(r.retirado_en);
    return f >= inicio && f <= fin;
  });
  const unidadesMes = retirosMes.reduce((s, r) => s + (r.cantidad || 1), 0);
  const perdidaMes = retirosMes.reduce((s, r) => s + (r.precio || 0) * (r.cantidad || 1), 0);

  // Resumen
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Resumen del mes', margen, y); y += 20;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`Productos retirados: ${retirosMes.length}  (${unidadesMes} unidades)`, margen, y); y += 16;
  doc.text(`Pérdida por vencimiento: ${soles(perdidaMes)}`, margen, y); y += 26;

  // Pérdida por área
  const porArea = {};
  retirosMes.forEach((r) => {
    const v = (r.precio || 0) * (r.cantidad || 1);
    porArea[r.categoria] = (porArea[r.categoria] || 0) + v;
  });
  const areas = Object.entries(porArea).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (areas.length) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
    doc.text('Pérdida por área', margen, y); y += 18;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
    for (const [area, v] of areas) {
      doc.text(`• ${area}`, margen, y);
      doc.text(soles(v), ancho - margen, y, { align: 'right' });
      y += 16;
    }
    y += 12;
  }

  // Lista de retiros
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  doc.text('Detalle de retiros', margen, y); y += 18;
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text('PRODUCTO', margen, y);
  doc.text('CANT.', ancho - 220, y, { align: 'right' });
  doc.text('VALOR', ancho - 140, y, { align: 'right' });
  doc.text('FECHA', ancho - margen, y, { align: 'right' });
  y += 6;
  doc.setDrawColor(220, 220, 220);
  doc.line(margen, y, ancho - margen, y); y += 14;
  doc.setTextColor(30, 30, 30);
  doc.setFont('helvetica', 'normal');

  if (!retirosMes.length) {
    doc.text('No hubo retiros registrados en este mes.', margen, y);
  }
  for (const r of retirosMes) {
    if (y > doc.internal.pageSize.getHeight() - margen) { doc.addPage(); y = margen; }
    const nombre = doc.splitTextToSize(r.nombre, ancho - 320)[0];
    doc.text(nombre, margen, y);
    doc.text(String(r.cantidad || 1), ancho - 220, y, { align: 'right' });
    doc.text(soles((r.precio || 0) * (r.cantidad || 1)), ancho - 140, y, { align: 'right' });
    doc.text(new Date(r.retirado_en).toLocaleDateString('es-PE'), ancho - margen, y, { align: 'right' });
    y += 15;
  }

  // Descarga manual (evita un bug de doc.save en esta versión de jsPDF).
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reporte-${nombreMes}-${anioDashboard}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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

  $('#mes-prev').addEventListener('click', () => moverMes(-1));
  $('#mes-next').addEventListener('click', () => moverMes(1));

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

  $('#btn-guardar').addEventListener('click', guardarProducto);
  $('#btn-cancelar').addEventListener('click', () => {
    fotoPendiente = null;
    productoEditando = null;
    codigoEscaneado = null;
    $('#modal-form').classList.add('oculto');
  });

  $('#buscador').addEventListener('input', (e) => {
    textoBusqueda = e.target.value.trim();
    pintarLista();
  });

  $('#btn-exportar').addEventListener('click', exportarRetiros);

  $('#btn-escanear').addEventListener('click', abrirEscaner);
  $('#btn-cerrar-escaner').addEventListener('click', cerrarEscaner);

  $('#btn-campana').addEventListener('click', abrirCampana);
  $('#btn-cerrar-campana').addEventListener('click', () => $('#modal-campana').classList.add('oculto'));
  $('#btn-pdf').addEventListener('click', generarReportePDF);

  $('#filtro-desde').addEventListener('change', (e) => { filtroDesde = e.target.value; pintarHistorial(); });
  $('#filtro-hasta').addEventListener('change', (e) => { filtroHasta = e.target.value; pintarHistorial(); });
  $('#btn-limpiar-filtro').addEventListener('click', () => {
    filtroDesde = filtroHasta = '';
    $('#filtro-desde').value = '';
    $('#filtro-hasta').value = '';
    pintarHistorial();
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
