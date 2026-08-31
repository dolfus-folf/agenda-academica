// Estado global
let state = {
  cursos: JSON.parse(localStorage.getItem('app_cursos')) || [],
  tareas: JSON.parse(localStorage.getItem('app_tareas')) || [],
  notas: JSON.parse(localStorage.getItem('app_notas')) || [],
  calificaciones: JSON.parse(localStorage.getItem('app_calificaciones')) || []
};

let filtroActual = 'todas';
let tareaEditandoId = null;
let cursoEditandoId = null;

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
  actualizarFechaHeader();
  renderizarTodo();
  registrarServiceWorker();
  verificarRecordatorios();
});

function registrarServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(() => console.log('SW Registrado'))
      .catch(err => console.error('Error al registrar SW:', err));
  }
}

function showToast(mensaje, tipo = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${tipo}`;
  toast.innerText = mensaje;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function persistir() {
  localStorage.setItem('app_cursos', JSON.stringify(state.cursos));
  localStorage.setItem('app_tareas', JSON.stringify(state.tareas));
  localStorage.setItem('app_notas', JSON.stringify(state.notas));
  localStorage.setItem('app_calificaciones', JSON.stringify(state.calificaciones));
  renderizarTodo();
}

function exportarDatos() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
  const anchor = document.createElement('a');
  anchor.setAttribute("href", dataStr);
  anchor.setAttribute("download", `agenda_backup_${new Date().toISOString().split('T')[0]}.json`);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  showToast("Copia de seguridad descargada", "success");
}

function importarDatos(event) {
  const fileReader = new FileReader();
  fileReader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.cursos && data.tareas) {
        state = {
          cursos: data.cursos || [],
          tareas: data.tareas || [],
          notas: data.notas || [],
          calificaciones: data.calificaciones || []
        };
        persistir();
        showToast("¡Datos importados correctamente!", "success");
      } else {
        showToast("El archivo JSON no es válido", "danger");
      }
    } catch (err) {
      showToast("Error al leer el archivo", "danger");
    }
  };
  if (event.target.files[0]) {
    fileReader.readAsText(event.target.files[0]);
  }
}

function solicitarNotificaciones() {
  if (!("Notification" in window)) {
    showToast("Tu navegador no soporta notificaciones", "danger");
    return;
  }
  Notification.requestPermission().then(perm => {
    if (perm === "granted") {
      showToast("¡Notificaciones activadas!", "success");
      verificarRecordatorios();
    } else {
      showToast("Permiso de notificaciones denegado", "danger");
    }
  });
}

function verificarRecordatorios() {
  if (Notification.permission !== "granted") return;
  const hoyStr = new Date().toISOString().split('T')[0];
  const pendientesHoy = state.tareas.filter(t => !t.completada && t.fecha && t.fecha.startsWith(hoyStr));
  if (pendientesHoy.length > 0) {
    new Notification("Agenda Académica", {
      body: `Tienes ${pendientesHoy.length} entrega(s) pendiente(s) para hoy.`,
      icon: "https://cdn-icons-png.flaticon.com/512/3652/3652191.png"
    });
  }
}

function cambiarVista(vistaId, btnElement) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  const vistaEl = document.getElementById(`view-${vistaId}`);
  if (vistaEl) vistaEl.classList.add('active');
  if (btnElement) btnElement.classList.add('active');

  const titulos = { hoy: 'Hoy', tareas: 'Todas las Tareas', cursos: 'Mis Cursos', notas: 'Bloc Temporal' };
  const headerTitle = document.getElementById('header-title');
  if (headerTitle) headerTitle.innerText = titulos[vistaId] || 'Hoy';
}

function abrirModal() { 
  tareaEditandoId = null;
  cursoEditandoId = null;
  const fTarea = document.getElementById('form-tarea');
  const fCurso = document.getElementById('form-curso');
  const fNota = document.getElementById('form-nota');
  if (fTarea) fTarea.reset();
  if (fCurso) fCurso.reset();
  if (fNota) fNota.reset();
  
  poblarSelectCursos();
  document.getElementById('modal-form').classList.remove('hidden'); 
}

function cerrarModal() { 
  document.getElementById('modal-form').classList.add('hidden'); 
  tareaEditandoId = null;
  cursoEditandoId = null;
}

function switchFormType(tipo) {
  document.getElementById('form-tarea').classList.toggle('hidden', tipo !== 'tarea');
  document.getElementById('form-curso').classList.toggle('hidden', tipo !== 'curso');
  document.getElementById('form-nota').classList.toggle('hidden', tipo !== 'nota');

  document.getElementById('tab-opt-tarea').classList.toggle('active', tipo === 'tarea');
  document.getElementById('tab-opt-curso').classList.toggle('active', tipo === 'curso');
  document.getElementById('tab-opt-nota').classList.toggle('active', tipo === 'nota');
}

function setSemanas(num) {
  const inputSemanas = document.getElementById('course-weeks');
  if (inputSemanas) inputSemanas.value = num;
}

// TAREAS
function guardarTarea(e) {
  e.preventDefault();
  const titulo = document.getElementById('task-title').value.trim();
  const cursoId = document.getElementById('task-course').value;
  const fecha = document.getElementById('task-date').value;

  if (!titulo || !fecha) return;

  if (tareaEditandoId) {
    state.tareas = state.tareas.map(t => 
      t.id === tareaEditandoId ? { ...t, titulo, cursoId, fecha } : t
    );
    showToast("Tarea actualizada", "success");
  } else {
    state.tareas.push({ id: Date.now().toString(), titulo, cursoId, fecha, completada: false });
    showToast("Tarea creada", "success");
  }

  persistir();
  cerrarModal();
}

function editarTarea(id) {
  const tarea = state.tareas.find(t => t.id === id);
  if (!tarea) return;

  tareaEditandoId = id;
  switchFormType('tarea');
  poblarSelectCursos();

  document.getElementById('task-title').value = tarea.titulo;
  document.getElementById('task-course').value = tarea.cursoId || '';
  document.getElementById('task-date').value = tarea.fecha;
  document.getElementById('modal-form').classList.remove('hidden');
}

function eliminarTarea(id) {
  state.tareas = state.tareas.filter(t => t.id !== id);
  persistir();
  showToast("Tarea eliminada", "info");
}

function exportarACalendar(id) {
  const tarea = state.tareas.find(t => t.id === id);
  if (!tarea || !tarea.fecha) return;

  const fechaObj = new Date(tarea.fecha);
  const isoFecha = fechaObj.toISOString().replace(/-|:|\.\d\d\d/g, "");

  const icsData = 
`BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Agenda Académica//ES
BEGIN:VEVENT
SUMMARY:${tarea.titulo}
DESCRIPTION:Entrega pendiente de la agenda académica.
DTSTART:${isoFecha}
DTEND:${isoFecha}
END:VEVENT
END:VCALENDAR`;

  const blob = new Blob([icsData], { type: 'text/calendar;charset=utf-8' });
  const link = document.createElement('a');
  link.href = window.URL.createObjectURL(blob);
  link.setAttribute('download', `${tarea.titulo}.ics`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  showToast("Archivo de evento descargado", "success");
}

// CURSOS
function guardarCurso(e) {
  e.preventDefault();
  const nombre = document.getElementById('course-name').value.trim();
  const aula = document.getElementById('course-room').value.trim();
  const horaInicio = document.getElementById('course-start-time').value;
  const horaFin = document.getElementById('course-end-time').value;
  const fechaInicio = document.getElementById('course-start-date').value;
  const semanasInput = document.getElementById('course-weeks');
  const semanas = semanasInput ? (parseInt(semanasInput.value) || 16) : 16;
  const color = document.getElementById('course-color').value;

  const diasSeleccionados = Array.from(document.querySelectorAll('.day-check:checked'))
                                 .map(cb => parseInt(cb.value));

  if (!nombre || !aula || !horaInicio || !horaFin || !fechaInicio || diasSeleccionados.length === 0) {
    showToast("Por favor completa todos los campos del curso", "danger");
    return;
  }

  const fInicioObj = new Date(fechaInicio + 'T00:00:00');
  const fFinObj = new Date(fInicioObj);
  fFinObj.setDate(fFinObj.getDate() + (semanas * 7));
  const fechaFin = fFinObj.toISOString().split('T')[0];

  const datosCurso = { nombre, aula, dias: diasSeleccionados, horaInicio, horaFin, fechaInicio, semanas, fechaFin, color };

  if (cursoEditandoId) {
    state.cursos = state.cursos.map(c => c.id === cursoEditandoId ? { ...c, ...datosCurso } : c);
    showToast("Curso actualizado", "success");
  } else {
    state.cursos.push({ id: Date.now().toString(), ...datosCurso });
    showToast("Curso agregado", "success");
  }

  persistir();
  cerrarModal();
}

function editarCurso(id) {
  const curso = state.cursos.find(c => c.id === id);
  if (!curso) return;

  cursoEditandoId = id;
  switchFormType('curso');

  document.getElementById('course-name').value = curso.nombre;
  document.getElementById('course-room').value = curso.aula;
  document.getElementById('course-start-time').value = curso.horaInicio;
  document.getElementById('course-end-time').value = curso.horaFin;
  document.getElementById('course-start-date').value = curso.fechaInicio;
  document.getElementById('course-weeks').value = curso.semanas || 16;
  document.getElementById('course-color').value = curso.color;

  document.querySelectorAll('.day-check').forEach(cb => {
    cb.checked = (curso.dias || []).includes(parseInt(cb.value));
  });

  document.getElementById('modal-form').classList.remove('hidden');
}

function eliminarCurso(id) {
  state.cursos = state.cursos.filter(c => c.id !== id);
  state.calificaciones = state.calificaciones.filter(cal => cal.cursoId !== id);
  persistir();
  showToast("Curso eliminado", "info");
}

// CALIFICACIONES / NOTAS
function guardarCalificacion(e) {
  e.preventDefault();
  const cursoId = document.getElementById('grade-course').value;
  const titulo = document.getElementById('grade-title').value.trim();
  const valor = document.getElementById('grade-value').value.trim();
  const observacion = document.getElementById('grade-obs').value.trim();

  if (!cursoId || !titulo || !valor) {
    showToast("Completa la materia, concepto y calificación", "danger");
    return;
  }

  state.calificaciones.push({
    id: Date.now().toString(),
    cursoId,
    titulo,
    valor,
    observacion
  });

  persistir();
  cerrarModal();
  showToast("Nota registrada en el curso", "success");
}

function eliminarCalificacion(id) {
  state.calificaciones = state.calificaciones.filter(c => c.id !== id);
  persistir();
  showToast("Nota eliminada", "info");
}

// RENDERIZADO
function renderHoy() {
  const container = document.getElementById('next-class-card');
  if (!container) return;

  const hoy = new Date();
  const diaSemana = hoy.getDay(); 
  const fechaHoyStr = hoy.toISOString().split('T')[0];
  const horaActualStr = hoy.toTimeString().substring(0, 5);

  const clasesHoy = state.cursos.filter(c => {
    if (!c.dias || !c.fechaInicio) return false;
    const fFin = c.fechaFin || c.fechaInicio;
    return fechaHoyStr >= c.fechaInicio && fechaHoyStr <= fFin && c.dias.includes(diaSemana);
  }).sort((a, b) => (a.horaInicio || '').localeCompare(b.horaInicio || ''));

  if (clasesHoy.length === 0) {
    container.innerHTML = '<p class="empty-msg">No hay clases programadas para hoy.</p>';
  } else {
    container.innerHTML = clasesHoy.map(c => {
      const enCurso = horaActualStr >= c.horaInicio && horaActualStr <= c.horaFin;
      return `
        <div style="border-left: 4px solid ${c.color}; margin-bottom: 10px;" class="card">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong>${c.nombre}</strong>
            ${enCurso ? '<span class="badge-live">EN CURSO</span>' : ''}
          </div>
          <p style="font-size:0.85rem; color:var(--text-dim); margin-top:4px;">${c.horaInicio} - ${c.horaFin} | Aula: ${c.aula}</p>
        </div>
      `;
    }).join('');
  }

  const todayTasksContainer = document.getElementById('today-tasks-list');
  if (!todayTasksContainer) return;

  const tareasDeHoy = state.tareas.filter(t => t.fecha && t.fecha.startsWith(fechaHoyStr));

  const totalHoy = tareasDeHoy.length;
  const completadasHoy = tareasDeHoy.filter(t => t.completada).length;
  const porcentaje = totalHoy > 0 ? Math.round((completadasHoy / totalHoy) * 100) : 100;
  
  const progressBar = document.getElementById('daily-progress-bar');
  const progressText = document.getElementById('daily-progress-text');
  if (progressBar) progressBar.style.width = `${porcentaje}%`;
  if (progressText) progressText.innerText = totalHoy > 0 ? `${completadasHoy}/${totalHoy} completadas (${porcentaje}%)` : "Sin tareas pendientes hoy";

  if (tareasDeHoy.length === 0) {
    todayTasksContainer.innerHTML = '<p class="empty-msg">¡Todo al día por hoy!</p>';
  } else {
    todayTasksContainer.innerHTML = tareasDeHoy.map(t => {
      const curso = state.cursos.find(c => c.id === t.cursoId);
      return `
        <div class="task-item ${t.completada ? 'completed' : ''}">
          <div style="display:flex; align-items:center; gap:10px;">
            <input type="checkbox" ${t.completada ? 'checked' : ''} onchange="alternarTarea('${t.id}')">
            <div>
              <span>${t.titulo}</span>
              <p class="empty-msg" style="font-size:0.8rem;">${curso ? curso.nombre : 'Sin curso'}</p>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }
}

function filtrarTareas(filtro) {
  filtroActual = filtro;
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('onclick').includes(filtro));
  });
  renderTareas();
}

function alternarTarea(id) {
  state.tareas = state.tareas.map(t => t.id === id ? {...t, completada: !t.completada} : t);
  persistir();
}

function guardarNotaRapida() {
  const input = document.getElementById('quick-note-input');
  if (!input || !input.value.trim()) return;
  state.notas.unshift({ id: Date.now().toString(), texto: input.value });
  input.value = '';
  persistir();
  showToast("Nota rápida guardada", "success");
}

function eliminarNota(id) {
  state.notas = state.notas.filter(n => n.id !== id);
  persistir();
  showToast("Nota rápida eliminada", "info");
}

function renderizarTodo() {
  poblarSelectCursos();
  renderCursos();
  renderTareas();
  renderHoy();
  renderNotas();
}

function renderNotas() {
  const container = document.getElementById('notes-list');
  if (!container) return;
  if (state.notas.length === 0) {
    container.innerHTML = '<p class="empty-msg">No hay notas temporales.</p>';
    return;
  }
  container.innerHTML = state.notas.map(n => `
    <div class="task-item">
      <span>${n.texto}</span>
      <button class="btn-delete" onclick="eliminarNota('${n.id}')">✕</button>
    </div>
  `).join('');
}

function poblarSelectCursos() {
  const selectTask = document.getElementById('task-course');
  const selectGrade = document.getElementById('grade-course');
  const selectFilter = document.getElementById('task-filter-course');

  const rellenar = (el, placeholder) => {
    if (!el) return;
    const val = el.value;
    el.innerHTML = `<option value="">${placeholder}</option>`;
    state.cursos.forEach(c => {
      el.innerHTML += `<option value="${c.id}">${c.nombre}</option>`;
    });
    el.value = val;
  };

  rellenar(selectTask, "Selecciona un Curso (Opcional)");
  rellenar(selectGrade, "Selecciona un Curso");
  rellenar(selectFilter, "Todos los cursos");
}

function renderCursos() {
  const container = document.getElementById('courses-list');
  if (!container) return;
  if (state.cursos.length === 0) {
    container.innerHTML = '<p class="empty-msg">No has agregado cursos aún.</p>';
    return;
  }
  const diasNombres = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  container.innerHTML = state.cursos.map(c => {
    const notasDelCurso = state.calificaciones.filter(cal => cal.cursoId === c.id);

    return `
      <div class="card" style="border-left: 4px solid ${c.color}; margin-bottom: 12px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <h3>${c.nombre}</h3>
            <p class="empty-msg">Aula: ${c.aula} | ${c.horaInicio} - ${c.horaFin}</p>
            <p class="empty-msg" style="font-size:0.8rem;">Días: ${(c.dias || []).map(d => diasNombres[d]).join(', ')} (${c.semanas || 16} sem)</p>
          </div>
          <div style="display:flex; gap:6px;">
            <button class="btn-delete" style="background:var(--surface); color:var(--text);" onclick="editarCurso('${c.id}')">✏️</button>
            <button class="btn-delete" onclick="eliminarCurso('${c.id}')">✕</button>
          </div>
        </div>

        <!-- Sección Registro de Calificaciones Integrado -->
        <div style="margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--border);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
            <strong style="font-size: 0.85rem; color: var(--text-dim);">Notas / Evaluaciones Registradas</strong>
          </div>
          ${notasDelCurso.length === 0 ? '<p class="empty-msg" style="font-size: 0.75rem;">Sin notas registradas aún.</p>' : ''}
          <div style="display: flex; flex-direction: column; gap: 4px;">
            ${notasDelCurso.map(cal => `
              <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg); padding: 4px 8px; border-radius: 6px; font-size:0.8rem;">
                <div>
                  <strong>${cal.titulo}:</strong> <span style="color:var(--primary); font-weight:bold;">${cal.valor}</span>
                  ${cal.observacion ? `<p style="font-size: 0.7rem; color: var(--text-dim);">${cal.observacion}</p>` : ''}
                </div>
                <button onclick="eliminarCalificacion('${cal.id}')" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:0.75rem;">✕</button>
              </div>
            `).join('')}
          </div>
        </div>

      </div>
    `;
  }).join('');
}

function renderTareas() {
  const container = document.getElementById('all-tasks-list');
  if (!container) return;
  
  let tareasFiltradas = [...state.tareas];
  const busqueda = (document.getElementById('task-search-input')?.value || '').toLowerCase();
  const filtroCurso = document.getElementById('task-filter-course')?.value || '';

  if (filtroActual === 'pendiente') {
    tareasFiltradas = tareasFiltradas.filter(t => !t.completada);
  } else if (filtroActual === 'completada') {
    tareasFiltradas = tareasFiltradas.filter(t => t.completada);
  }

  if (filtroCurso) {
    tareasFiltradas = tareasFiltradas.filter(t => t.cursoId === filtroCurso);
  }

  if (busqueda) {
    tareasFiltradas = tareasFiltradas.filter(t => t.titulo.toLowerCase().includes(busqueda));
  }

  tareasFiltradas.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

  if (tareasFiltradas.length === 0) {
    container.innerHTML = '<p class="empty-msg">No hay tareas en esta sección.</p>';
    return;
  }

  const ahora = new Date();

  container.innerHTML = tareasFiltradas.map(t => {
    const curso = state.cursos.find(c => c.id === t.cursoId);
    const fechaObj = new Date(t.fecha);
    const estaVencida = !t.completada && fechaObj < ahora;
    const fechaFormatted = t.fecha ? fechaObj.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : 'Sin fecha';

    return `
      <div class="task-item ${t.completada ? 'completed' : ''} ${estaVencida ? 'vencida' : ''}">
        <div style="display:flex; align-items:center; gap:10px;">
          <input type="checkbox" ${t.completada ? 'checked' : ''} onchange="alternarTarea('${t.id}')">
          <div>
            <span>${t.titulo}</span>
            <p class="empty-msg" style="font-size:0.8rem;">
              ${curso ? curso.nombre : 'Sin curso'} - ${fechaFormatted}
              ${estaVencida ? '<span class="badge-vencida">VENCIDA</span>' : ''}
            </p>
          </div>
        </div>
        <div style="display:flex; gap:4px;">
          <button class="btn-delete" style="background:var(--surface); color:var(--text);" onclick="exportarACalendar('${t.id}')" title="Agregar a Calendario">📅</button>
          <button class="btn-delete" style="background:var(--surface); color:var(--text);" onclick="editarTarea('${t.id}')">✏️</button>
          <button class="btn-delete" onclick="eliminarTarea('${t.id}')">✕</button>
        </div>
      </div>
    `;
  }).join('');
}

function actualizarFechaHeader() {
  const el = document.getElementById('header-date');
  if (!el) return;
  const opciones = { weekday: 'short', day: 'numeric', month: 'short' };
  el.innerText = new Date().toLocaleDateString('es-ES', opciones);
}