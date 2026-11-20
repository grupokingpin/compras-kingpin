/**
 * LÓGICA DE FRONTEND - SISTEMA DE ÓRDENES DE COMPRA GRUPO KINGPIN
 * Conectado a Google Apps Script Backend
 */

const API_URL = 'https://script.google.com/macros/s/AKfycbwVP6KwX9rcAwuw2r5c1X2yYfbswsa1Lt7xepvdZWIBtGPOoMOVgGOi8rWtcsYofjnA/exec';

let estado = {
  usuario: null,
  sucursales: [],
  sucursalActiva: null,
  proveedores: [],
  productos: [],
  proveedorActivo: null,
  carrito: {} // { sku: { sku, descripcion, um, precio, cantidad } }
};

// Cargar usuarios al iniciar la pantalla
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const resp = await fetch(`${API_URL}?action=getUsuarios`);
    const json = await resp.json();

    if (json.exito && json.usuarios) {
      const sel = document.getElementById('select-usuario');
      sel.innerHTML = '<option value="">-- Selecciona tu nombre --</option>';
      json.usuarios.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.nombre;
        opt.textContent = `${u.nombre} (${u.rol})`;
        sel.appendChild(opt);
      });
      document.getElementById('login-loader').classList.add('hidden');
      document.getElementById('login-form').classList.remove('hidden');
    } else {
      document.getElementById('login-loader').textContent = 'No se pudieron cargar los usuarios. Recarga la página.';
    }
  } catch (error) {
    console.error(error);
    document.getElementById('login-loader').textContent = 'Error de conexión con el servidor. Verifica tu internet.';
  }
});

// Función auxiliar para peticiones POST a Apps Script
async function postApi(datos) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(datos)
  });
  return await response.json();
}

async function intentarLogin() {
  const nombre = document.getElementById('select-usuario').value;
  const pin = document.getElementById('input-pin').value.trim();

  if (!nombre) return alert('Por favor selecciona tu nombre de la lista.');
  if (!pin) return alert('Ingresa tu PIN de acceso.');

  const btn = document.getElementById('btn-ingresar');
  btn.disabled = true;
  btn.textContent = 'Verificando PIN...';

  try {
    const res = await postApi({ action: 'login', nombre: nombre, pin: pin });
    btn.disabled = false;
    btn.textContent = 'Ingresar al Sistema';

    if (!res.exito) {
      alert(res.mensaje);
      document.getElementById('input-pin').value = '';
      return;
    }

    estado.usuario = res.usuario;
    estado.sucursales = res.sucursales;

    document.getElementById('vista-login').classList.add('hidden');
    document.getElementById('vista-app').classList.remove('hidden');
    document.getElementById('app-usuario-subtitulo').textContent = `${estado.usuario.nombre} • ${estado.usuario.rol}`;

    const selSuc = document.getElementById('select-sucursal');
    selSuc.innerHTML = '';
    estado.sucursales.forEach((s, idx) => {
      const opt = document.createElement('option');
      opt.value = idx;
      opt.textContent = `${s.nombre} (${s.region})`;
      selSuc.appendChild(opt);
    });

    if (estado.sucursales.length > 1) {
      document.getElementById('bloque-sucursal').classList.remove('hidden');
    } else {
      document.getElementById('bloque-sucursal').classList.add('hidden');
    }

    seleccionarSucursalPorIndice(0);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Ingresar al Sistema';
    alert('Error de comunicación al validar acceso. Intenta de nuevo.');
  }
}

function cambiarSucursal() {
  const idx = document.getElementById('select-sucursal').value;
  seleccionarSucursalPorIndice(idx);
}

async function seleccionarSucursalPorIndice(idx) {
  const suc = estado.sucursales[idx];
  estado.sucursalActiva = suc;
  estado.carrito = {};
  actualizarBarraCarrito();

  // Aplicar paleta visual condicional (Bolerama Coyoacán vs Grupo Kingpin)
  if (suc.id === 'BOL_COY') {
    document.body.classList.add('tema-bolerama');
  } else {
    document.body.classList.remove('tema-bolerama');
  }

  document.getElementById('app-logo').src = suc.logoUrl;
  document.getElementById('app-sucursal-titulo').textContent = suc.nombre;
  document.getElementById('hero-region-badge').textContent = `REGIÓN ${suc.region}`;
  document.getElementById('hero-sucursal-nombre').textContent = suc.nombre;
  document.getElementById('hero-sucursal-dir').textContent = suc.direccion;

  document.getElementById('bloque-productos').classList.add('hidden');
  document.getElementById('info-proveedor').textContent = '';

  const selPrv = document.getElementById('select-proveedor');
  selPrv.innerHTML = '<option value="">Cargando proveedores y precios...</option>';

  try {
    const res = await postApi({ action: 'catalogo', idSucursal: suc.id, region: suc.region });
    if (res.exito) {
      estado.proveedores = res.data.proveedores;
      estado.productos = res.data.productos;

      selPrv.innerHTML = '<option value="">-- Elige un proveedor --</option>';
      estado.proveedores.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.nombre} (${p.categoria})`;
        selPrv.appendChild(opt);
      });
    }
  } catch (err) {
    selPrv.innerHTML = '<option value="">Error al cargar proveedores</option>';
  }
}

function filtrarProductosProveedor() {
  const idPrv = document.getElementById('select-proveedor').value;
  estado.carrito = {};
  actualizarBarraCarrito();

  if (!idPrv) {
    document.getElementById('bloque-productos').classList.add('hidden');
    document.getElementById('info-proveedor').textContent = '';
    return;
  }

  estado.proveedorActivo = estado.proveedores.find(p => p.id === idPrv);
  document.getElementById('info-proveedor').textContent = `Atención: ${estado.proveedorActivo.contacto || 'Ventas'} • WhatsApp: ${estado.proveedorActivo.whatsapp || 'N/A'}`;
  document.getElementById('input-buscar').value = '';
  document.getElementById('bloque-productos').classList.remove('hidden');
  renderizarListaProductos();
}

function renderizarListaProductos() {
  if (!estado.proveedorActivo) return;
  const textoBusqueda = document.getElementById('input-buscar').value.toLowerCase().trim();
  const contenedor = document.getElementById('lista-productos');

  const filtrados = estado.productos.filter(p => {
    if (p.idProveedor !== estado.proveedorActivo.id) return false;
    if (!textoBusqueda) return true;
    return p.descripcion.toLowerCase().includes(textoBusqueda) || p.sku.toLowerCase().includes(textoBusqueda);
  });

  document.getElementById('contador-productos').textContent = `${filtrados.length} insumos`;
  contenedor.innerHTML = '';

  filtrados.forEach(prod => {
    const cantActual = estado.carrito[prod.sku] ? estado.carrito[prod.sku].cantidad : 0;
    const div = document.createElement('div');
    div.className = 'product-item' + (cantActual > 0 ? ' selected' : '');
    div.innerHTML = `
      <div class="prod-info">
        <div class="prod-name">${prod.descripcion}</div>
        <div class="prod-meta">${prod.sku} • UM: <strong>${prod.um}</strong> • <span class="prod-price">$${prod.precio.toFixed(2)}</span></div>
      </div>
      <div class="qty-controls">
        <button class="qty-btn" onclick="modificarCantidad('${prod.sku}', -1)">−</button>
        <input type="number" step="0.1" min="0" class="qty-input" value="${cantActual || ''}" placeholder="0" onchange="setCantidadManual('${prod.sku}', this.value)">
        <button class="qty-btn" onclick="modificarCantidad('${prod.sku}', 1)">+</button>
      </div>
    `;
    contenedor.appendChild(div);
  });
}

function modificarCantidad(sku, delta) {
  const prod = estado.productos.find(p => p.sku === sku);
  if (!prod) return;
  const actual = estado.carrito[sku] ? estado.carrito[sku].cantidad : 0;
  const nueva = Math.max(0, Math.round((actual + delta) * 100) / 100);
  actualizarItemCarrito(prod, nueva);
  renderizarListaProductos();
}

function setCantidadManual(sku, valor) {
  const prod = estado.productos.find(p => p.sku === sku);
  if (!prod) return;
  const nueva = Math.max(0, parseFloat(valor) || 0);
  actualizarItemCarrito(prod, nueva);
  renderizarListaProductos();
}

function actualizarItemCarrito(prod, cantidad) {
  if (cantidad <= 0) {
    delete estado.carrito[prod.sku];
  } else {
    estado.carrito[prod.sku] = {
      sku: prod.sku,
      descripcion: prod.descripcion,
      um: prod.um,
      precio: prod.precio,
      cantidad: cantidad
    };
  }
  actualizarBarraCarrito();
}

function actualizarBarraCarrito() {
  const items = Object.values(estado.carrito);
  const barra = document.getElementById('barra-carrito');
  if (items.length === 0) {
    barra.classList.add('hidden');
    return;
  }

  let total = 0;
  items.forEach(i => total += i.cantidad * i.precio);

  document.getElementById('total-partidas').textContent = items.length;
  document.getElementById('total-dinero').textContent = '$' + total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  barra.classList.remove('hidden');
}

function abrirModalRevision() {
  const items = Object.values(estado.carrito);
  if (items.length === 0) return;

  document.getElementById('paso-confirmar').classList.remove('hidden');
  document.getElementById('paso-exito').classList.add('hidden');

  document.getElementById('resumen-cabecera').innerHTML = `
    <strong>Sucursal:</strong> ${estado.sucursalActiva.nombre}<br>
    <strong>Proveedor:</strong> ${estado.proveedorActivo.nombre}<br>
    <strong>Correos destino:</strong> ${estado.proveedorActivo.correos || 'Sin correo registrado'}
  `;

  const listaModal = document.getElementById('lista-carrito-modal');
  listaModal.innerHTML = '';
  let total = 0;

  items.forEach(item => {
    const sub = item.cantidad * item.precio;
    total += sub;
    listaModal.innerHTML += `
      <div class="cart-row">
        <div>
          <strong>${item.descripcion}</strong><br>
          <span style="color:var(--text-muted); font-size:11px;">${item.cantidad} ${item.um} × $${item.precio.toFixed(2)}</span>
        </div>
        <div style="font-weight:800;">$${sub.toFixed(2)}</div>
      </div>
    `;
  });

  document.getElementById('modal-total-dinero').textContent = '$' + total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  document.getElementById('modal-pedido').classList.add('active');
}

function cerrarModal() {
  document.getElementById('modal-pedido').classList.remove('active');
}

async function enviarOrdenDefinitiva() {
  const btn = document.getElementById('btn-enviar-orden');
  btn.disabled = true;
  btn.textContent = 'Generando PDF y enviando...';

  const payload = {
    action: 'crearOrden',
    pedido: {
      usuario: estado.usuario,
      sucursal: estado.sucursalActiva,
      proveedor: estado.proveedorActivo,
      partidas: Object.values(estado.carrito),
      notas: document.getElementById('input-notas').value.trim()
    }
  };

  try {
    const res = await postApi(payload);
    btn.disabled = false;
    btn.textContent = 'Generar PDF y Enviar Orden';

    if (!res.exito) {
      alert(res.mensaje);
      return;
    }

    document.getElementById('paso-confirmar').classList.add('hidden');
    document.getElementById('paso-exito').classList.remove('hidden');

    document.getElementById('exito-folio').textContent = `Folio: ${res.folio}`;
    document.getElementById('exito-detalle').textContent = res.correoEnviado
      ? 'El PDF se guardó en Google Drive y se envió automáticamente por correo electrónico al proveedor.'
      : 'El PDF se guardó en Google Drive (el proveedor no tiene correo registrado, envíalo por WhatsApp).';

    document.getElementById('link-whatsapp').href = res.whatsappUrl;
    document.getElementById('link-pdf').href = res.pdfUrl;

    estado.carrito = {};
    actualizarBarraCarrito();
    renderizarListaProductos();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Generar PDF y Enviar Orden';
    alert('Ocurrió un error de red al enviar la orden. Verifica en Google Drive si se generó antes de reintentar.');
  }
}

function nuevaOrden() {
  document.getElementById('input-notas').value = '';
  cerrarModal();
}

function cerrarSesion() {
  estado.usuario = null;
  estado.carrito = {};
  document.getElementById('input-pin').value = '';
  document.getElementById('vista-app').classList.add('hidden');
  document.getElementById('vista-login').classList.remove('hidden');
  document.body.classList.remove('tema-bolerama');
}
