// Estado global de la aplicación
let state = {
  cursos: [],
  tareas: [],
  notas: [],
  calificaciones: []
};

let filtroActual = 'todas';
let tareaEditandoId = null;
let cursoEditandoId = null;

const DOC_ID = "mi_agenda_usuario";

// ==========================================
// SINCRONIZACIÓN Y PERSISTENCIA (FIREBASE)
// ==========================================

function iniciarSincronizacionFirebase() {
  if (!window.db) return;

  // Escuchar cambios en tiempo real desde Firestore
  window.db.collection("agendas").doc(DOC_ID)
    .onSnapshot((docSnap) => {
      if (docSnap.exists) {
        const data = docSnap.data();
        state = {
          cursos: data.cursos || [],
          tareas: data.tareas || [],
          notas: data.notas || [],
          calificaciones: data.calificaciones || []
        };
        renderizarTodo();
      } else {
        // Cargar respaldo local si no hay documento en la nube aún
        const localCursos = JSON.parse(localStorage.getItem('app_cursos')) || [];
        const localTareas = JSON.parse(localStorage.getItem('app_tareas')) || [];
        const localNotas = JSON.parse(localStorage.getItem('app_notas')) || [];
        const localCalificaciones = JSON.parse(localStorage.getItem('app_calificaciones')) || [];

        if (localCursos.length || localTareas.length || localNotas.length) {
          state = { cursos: localCursos, tareas: localTareas, notas: localNotas, calificaciones: localCalificaciones };
          persistir();
        }
      }
    }, (err) => {
      console.error("Error al sincronizar Firestore en tiempo real:", err);
    });
}

function persistir() {
  // Guardar en almacenamiento local como respaldo offline
  localStorage.setItem('app_cursos', JSON.stringify(state.cursos));
  localStorage.setItem('app_tareas', JSON.stringify(state.tareas));
  localStorage.setItem('app_notas', JSON.stringify(state.notas));
  localStorage.setItem('app_calificaciones', JSON.stringify(state.calificaciones));

  renderizarTodo();

  // Guardar en la base de datos remota de Firebase
  if (window.db) {
    window.db.collection("agendas").doc(DOC_ID).set(state)
      .catch(err => console.error("Error al guardar datos en Firestore:", err));
  }
}

// ==========================================
// INICIALIZACIÓN
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  actualizarFechaHeader();
  iniciarSincronizacionFirebase();
  registrarServiceWorker();
  verificarRecordatorios();
});

function actualizarFechaHeader() {
  const now = new Date();
  const options = { weekday: 'long', day: 'numeric', month: 'long' };
  const fechaTexto = now.toLocaleDateString('es-ES', options);
  const elDate = document.getElementById('header-date');
  if (elDate) {
    elDate.textContent = fechaTexto.charAt(0).toUpperCase() + fechaTexto.slice(1);
  }
}

function registrarServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(() => console.log('Service Worker Registrado'))
      .catch(err => console.error('Error Service Worker:', err));
  }
}

// ==========================================
// NAVEGACIÓN Y VISTAS
// ==========================================

function cambiarVista(vistaId, btn) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  const targetView = document.getElementById(`view-${vistaId}`);
  if (targetView) targetView.classList.add('active');
  if (btn) btn.classList.add('active');

  const headerTitle = document.getElementById('header-title');
  if (headerTitle) {
    const titulos = { hoy: 'Hoy', tareas: 'Entregas', cursos: 'Cursos', notas: 'Notas Rápidas' };
    headerTitle.textContent = titulos[vistaId] || 'Mi Agenda';
  }
}

// ==========================================
// MANTENIMIENTO Y RENDERIZADO
// ==========================================

function renderizarTodo() {
  renderizarHoy();
  renderizarTareas();
  renderizarCursos();
  renderizarNotas();
  poblarSelectCursos();
}

function renderizarHoy() {
  const today = new Date();
  const dayOfWeek = today.getDay().toString(); // 0-6
  const dateStr = today.toISOString().split('T')[0];

  // 1. Clases de hoy
  const clasesHoy = state.cursos.filter(c => c.dias && c.dias.includes(dayOfWeek));
  const elClases = document.getElementById('next-class-card');
  if (elClases) {
    if (clasesHoy.length === 0) {
      elClases.innerHTML = '<p class="empty-msg">No hay clases programadas para hoy.</p>';
    } else {
      elClases.innerHTML = clasesHoy.map(c => `
        <div class="card" style="border-left: 4px solid ${c.color || '#3b82f6'}; padding: 10px; margin-bottom: 8px; background: var(--surface); border-radius: 8px;">
          <strong>${c.nombre}</strong>
          <div style="font-size: 0.85rem; color: var(--text-dim);">📍 Aula: ${c.aula} | ⏰ ${c.horaInicio} - ${c.horaFin}</div>
        </div>
      `).join('');
    }
  }

  // 2. Entregas de hoy
  const tareasHoy = state.tareas.filter(t => t.fecha && t.fecha.startsWith(dateStr));
  const elTareasHoy = document.getElementById('today-tasks-list');
  if (elTareasHoy) {
    if (tareasHoy.length === 0) {
      elTareasHoy.innerHTML = '<p class="empty-msg">¡Todo al día por hoy!</p>';
    } else {
      elTareasHoy.innerHTML = tareasHoy.map(t => crearHtmlTarea(t)).join('');
    }
  }

  // 3. Barra de Progreso Diario
  const completadasHoy = tareasHoy.filter(t => t.completada).length;
  const pct = tareasHoy.length > 0 ? Math.round((completadasHoy / tareasHoy.length) * 100) : 0;
  
  const elBar = document.getElementById('daily-progress-bar');
  const elText = document.getElementById('daily-progress-text');
  if (elBar) elBar.style.width = `${pct}%`;
  if (elText) elText.textContent = `${pct}% completado (${completadasHoy}/${tareasHoy.length})`;
}

function renderizarTareas() {
  const elList = document.getElementById('all-tasks-list');
  if (!elList) return;

  let tareasFiltradas = state.tareas;
  if (filtroActual === 'pendiente') tareasFiltradas = state.tareas.filter(t => !t.completada);
  if (filtroActual === 'completada') tareasFiltradas = state.tareas.filter(t => t.completada);

  if (tareasFiltradas.length === 0) {
    elList.innerHTML = '<p class="empty-msg">No hay entregas registradas en esta categoría.</p>';
    return;
  }

  elList.innerHTML = tareasFiltradas.map(t => crearHtmlTarea(t)).join('');
}

function crearHtmlTarea(t) {
  const cursoObj = state.cursos.find(c => c.id === t.cursoId);
  const colorCurso = cursoObj ? cursoObj.color : '#3b82f6';
  const nombreCurso = cursoObj ? cursoObj.nombre : 'General';

  const fechaObj = new Date(t.fecha);
  const fechaFormatted = isNaN(fechaObj) ? t.fecha : fechaObj.toLocaleString('es-ES', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return `
    <div class="task-item ${t.completada ? 'completed' : ''}" style="border-left: 4px solid ${colorCurso}; display: flex; align-items: center; justify-content: space-between; padding: 10px; background: var(--surface); margin-bottom: 8px; border-radius: 8px;">
      <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
        <input type="checkbox" ${t.completada ? 'checked' : ''} onchange="toggleTarea('${t.id}')">
        <div>
          <strong style="${t.completada ? 'text-decoration: line-through; color: var(--text-dim);' : ''}">${t.titulo}</strong>
          <div style="font-size: 0.8rem; color: var(--text-dim);">📘 ${nombreCurso} | 📅 ${fechaFormatted}</div>
        </div>
      </div>
      <div style="display: flex; gap: 5px;">
        <button onclick="editarTarea('${t.id}')" style="background: none; border: none; cursor: pointer;">✏️</button>
        <button onclick="eliminarTarea('${t.id}')" style="background: none; border: none; cursor: pointer;">🗑️</button>
      </div>
    </div>
  `;
}

function renderizarCursos() {
  const elGrid = document.getElementById('courses-list');
  if (!elGrid) return;

  if (state.cursos.length === 0) {
    elGrid.innerHTML = '<p class="empty-msg">No has agregado materias aún. Haz clic en + para agregar la primera.</p>';
    return;
  }

  const mapDias = { '1':'L', '2':'M', '3':'X', '4':'J', '5':'V', '6':'S', '0':'D' };

  elGrid.innerHTML = state.cursos.map(c => {
    const strDias = (c.dias || []).map(d => mapDias[d] || d).join(', ');
    return `
      <div class="course-card" style="border-top: 5px solid ${c.color || '#3b82f6'}; background: var(--surface); padding: 12px; border-radius: 8px; margin-bottom: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h3>${c.nombre}</h3>
          <div>
            <button onclick="editarCurso('${c.id}')" style="background:none; border:none; cursor:pointer;">✏️</button>
            <button onclick="eliminarCurso('${c.id}')" style="background:none; border:none; cursor:pointer;">🗑️</button>
          </div>
        </div>
        <p style="font-size: 0.85rem; color: var(--text-dim); margin-top: 4px;">📍 Aula: ${c.aula}</p>
        <p style="font-size: 0.85rem; color: var(--text-dim);">🗓️ Días: ${strDias} (${c.horaInicio} - ${c.horaFin})</p>
        <p style="font-size: 0.85rem; color: var(--text-dim);">🎓 Duración: ${c.semanas || 16} semanas</p>
      </div>
    `;
  }).join('');
}

function renderizarNotas() {
  const elList = document.getElementById('notes-list');
  if (!elList) return;

  if (state.notas.length === 0) {
    elList.innerHTML = '<p class="empty-msg">No hay notas rápidas guardadas.</p>';
    return;
  }

  elList.innerHTML = state.notas.map(n => `
    <div style="background: var(--surface); padding: 10px; border-radius: 8px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: flex-start;">
      <p style="white-space: pre-wrap; font-size: 0.9rem; flex: 1; margin: 0;">${n.texto}</p>
      <button onclick="eliminarNota('${n.id}')" style="background:none; border:none; cursor:pointer; margin-left: 10px;">🗑️</button>
    </div>
  `).join('');
}

function poblarSelectCursos() {
  const select = document.getElementById('task-course');
  if (!select) return;

  const actualVal = select.value;
  select.innerHTML = '<option value="">Selecciona un Curso (Opcional)</option>' + 
    state.cursos.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
  select.value = actualVal;
}

// ==========================================
// ACCIONES Y OPERACIONES CRUD
// ==========================================

function toggleTarea(id) {
  const t = state.tareas.find(x => x.id === id);
  if (t) {
    t.completada = !t.completada;
    persistir();
  }
}

function guardarTarea(e) {
  e.preventDefault();
  const titulo = document.getElementById('task-title').value;
  const cursoId = document.getElementById('task-course').value;
  const fecha = document.getElementById('task-date').value;

  if (tareaEditandoId) {
    const t = state.tareas.find(x => x.id === tareaEditandoId);
    if (t) {
      t.titulo = titulo;
      t.cursoId = cursoId;
      t.fecha = fecha;
    }
    tareaEditandoId = null;
  } else {
    state.tareas.push({
      id: 't_' + Date.now(),
      titulo,
      cursoId,
      fecha,
      completada: false
    });
  }

  cerrarModal();
  persistir();
}

function editarTarea(id) {
  const t = state.tareas.find(x => x.id === id);
  if (!t) return;

  tareaEditandoId = id;
  switchFormType('tarea');
  abrirModal();

  document.getElementById('task-title').value = t.titulo;
  document.getElementById('task-course').value = t.cursoId || '';
  document.getElementById('task-date').value = t.fecha;
}

function eliminarTarea(id) {
  state.tareas = state.tareas.filter(x => x.id !== id);
  persistir();
}

function guardarCurso(e) {
  e.preventDefault();
  const nombre = document.getElementById('course-name').value;
  const aula = document.getElementById('course-room').value;
  const horaInicio = document.getElementById('course-start-time').value;
  const horaFin = document.getElementById('course-end-time').value;
  const fechaInicio = document.getElementById('course-start-date').value;
  const semanas = document.getElementById('course-weeks').value;
  const color = document.getElementById('course-color').value;

  const checks = document.querySelectorAll('.day-check:checked');
  const dias = Array.from(checks).map(cb => cb.value);

  if (cursoEditandoId) {
    const c = state.cursos.find(x => x.id === cursoEditandoId);
    if (c) {
      c.nombre = nombre;
      c.aula = aula;
      c.horaInicio = horaInicio;
      c.horaFin = horaFin;
      c.fechaInicio = fechaInicio;
      c.semanas = semanas;
      c.color = color;
      c.dias = dias;
    }
    cursoEditandoId = null;
  } else {
    state.cursos.push({
      id: 'c_' + Date.now(),
      nombre,
      aula,
      horaInicio,
      horaFin,
      fechaInicio,
      semanas,
      color,
      dias
    });
  }

  cerrarModal();
  persistir();
}

function editarCurso(id) {
  const c = state.cursos.find(x => x.id === id);
  if (!c) return;

  cursoEditandoId = id;
  switchFormType('curso');
  abrirModal();

  document.getElementById('course-name').value = c.nombre;
  document.getElementById('course-room').value = c.aula;
  document.getElementById('course-start-time').value = c.horaInicio;
  document.getElementById('course-end-time').value = c.horaFin;
  document.getElementById('course-start-date').value = c.fechaInicio || '';
  document.getElementById('course-weeks').value = c.semanas || 16;
  document.getElementById('course-color').value = c.color || '#3b82f6';

  document.querySelectorAll('.day-check').forEach(cb => {
    cb.checked = (c.dias || []).includes(cb.value);
  });
}

function eliminarCurso(id) {
  state.cursos = state.cursos.filter(x => x.id !== id);
  persistir();
}

function setSemanas(n) {
  const input = document.getElementById('course-weeks');
  if (input) input.value = n;
}

function guardarNotaRapida() {
  const input = document.getElementById('quick-note-input');
  if (!input || !input.value.trim()) return;

  state.notas.push({
    id: 'n_' + Date.now(),
    texto: input.value.trim(),
    fecha: new Date().toISOString()
  });

  input.value = '';
  persistir();
}

function eliminarNota(id) {
  state.notas = state.notas.filter(x => x.id !== id);
  persistir();
}

function filtrarTareas(tipo) {
  filtroActual = tipo;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  if (event && event.target) event.target.classList.add('active');
  renderizarTareas();
}

// ==========================================
// MODAL Y UTILIDADES
// ==========================================

function abrirModal() {
  const modal = document.getElementById('modal-form');
  if (modal) modal.classList.remove('hidden');
}

function cerrarModal() {
  const modal = document.getElementById('modal-form');
  if (modal) modal.classList.add('hidden');
  tareaEditandoId = null;
  cursoEditandoId = null;
  
  const formT = document.getElementById('form-tarea');
  const formC = document.getElementById('form-curso');
  if (formT) formT.reset();
  if (formC) formC.reset();
}

function switchFormType(tipo) {
  const formT = document.getElementById('form-tarea');
  const formC = document.getElementById('form-curso');
  const tabT = document.getElementById('tab-opt-tarea');
  const tabC = document.getElementById('tab-opt-curso');

  if (tipo === 'tarea') {
    formT.classList.remove('hidden');
    formC.classList.add('hidden');
    tabT.classList.add('active');
    tabC.classList.remove('active');
  } else {
    formC.classList.remove('hidden');
    formT.classList.add('hidden');
    tabC.classList.add('active');
    tabT.classList.remove('active');
  }
}

function exportarDatos() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
  const dlAnchorElem = document.createElement('a');
  dlAnchorElem.setAttribute("href", dataStr);
  dlAnchorElem.setAttribute("download", `agenda_backup_${new Date().toISOString().split('T')[0]}.json`);
  dlAnchorElem.click();
}

function importarDatos(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const parsed = JSON.parse(evt.target.result);
      if (parsed.cursos || parsed.tareas) {
        state = {
          cursos: parsed.cursos || [],
          tareas: parsed.tareas || [],
          notas: parsed.notas || [],
          calificaciones: parsed.calificaciones || []
        };
        persistir();
        alert('¡Copia de seguridad importada y sincronizada correctamente!');
      }
    } catch (err) {
      alert('Error al leer el archivo de copia de seguridad.');
    }
  };
  reader.readAsText(file);
}

function verificarRecordatorios() {
  // Función auxiliar para notificaciones nativas si están permitidas
  if ("Notification" in window && Notification.permission === "granted") {
    // Lógica opcional de recordatorios
  }
}
