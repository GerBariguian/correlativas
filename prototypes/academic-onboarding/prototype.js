// Visual prototype only. No imports from product, network, storage or persistence.
const subjects = [
  { id:'M01', name:'Álgebra y geometría', year:1, period:'1.er cuatrimestre', saved:'Aprobada' },
  { id:'M02', name:'Introducción a la programación', year:1, period:'1.er cuatrimestre' },
  { id:'M03', name:'Sistemas y organizaciones', year:1, period:'1.er cuatrimestre' },
  { id:'M04', name:'Análisis matemático I', year:1, period:'2.º cuatrimestre', saved:'Regularizada' },
  { id:'M05', name:'Algoritmos y estructuras de datos', year:1, period:'2.º cuatrimestre' },
  { id:'M06', name:'Arquitectura de computadoras', year:1, period:'2.º cuatrimestre' },
  { id:'M07', name:'Programación orientada a objetos', year:2, period:'1.er cuatrimestre' },
  { id:'M08', name:'Probabilidad y estadística', year:2, period:'1.er cuatrimestre' },
  { id:'M09', name:'Bases de datos', year:2, period:'2.º cuatrimestre' },
  { id:'M10', name:'Redes de computadoras', year:2, period:'2.º cuatrimestre' },
  { id:'M11', name:'Proyecto integrador', year:2, period:'Anual' },
  { id:'M12', name:'Seminario electivo', year:2, period:'Período no especificado' },
]
const statuses = ['Pendiente','Cursando','Regularizada','Aprobada']
const classes = ['pending','course','regular','approved']
const marks = ['○','◷','◇','✓']
const editable = subjects.filter(s => !s.saved)
let screen = 0, choice = 'experienced', decisions = {}, selected = new Set(), history = []
const app = document.getElementById('app')
const badge = value => value ? `<span class="status ${classes[statuses.indexOf(value)]}">${marks[statuses.indexOf(value)]} ${value}</span>` : '<span class="status unreviewed">Sin revisar</span>'
const chip = '<div class="career-chip">Carrera ficticia · Ingeniería en Sistemas · Plan demo</div>'
const announce = text => { document.getElementById('announcer').textContent = text }
function go(next) { screen = next; render(); window.scrollTo(0,0); document.querySelector('h1').focus() }
function render() {
  const focused = document.activeElement?.id
  document.getElementById('steps').innerHTML = ['Bienvenida','Carga académica','Revisión'].map((name,i) => `${i ? '<span class="step-line" aria-hidden="true"></span>' : ''}<button class="step" data-step="${i}" ${screen === i ? 'aria-current="step"' : ''}><b>${i+1}</b>${name}</button>`).join('')
  app.innerHTML = screen === 0 ? welcome() : screen === 1 ? workspace() : review()
  if (focused) document.getElementById(focused)?.focus()
}
function welcome() {
  return `<section class="welcome"><div class="welcome-intro">${chip}<p class="eyebrow">Tu punto de partida</p><h1 tabindex="-1">Tu recorrido empieza donde estás.</h1><p class="muted">Contanos en qué momento de la carrera estás.<br>Después, te ayudamos a organizar lo que viene.</p></div>
  <div class="options" role="group" aria-label="Situación académica">
    <button class="option ${choice === 'starting' ? 'selected' : ''}" data-choice="starting" aria-pressed="${choice === 'starting'}"><span class="radio" aria-hidden="true"></span><span class="option-icon" aria-hidden="true">↗</span><strong>Estoy empezando</strong><small>Todavía no cursé materias. Quiero explorar mi carrera sin cargar estados ahora.</small></button>
    <button class="option ${choice === 'experienced' ? 'selected' : ''}" data-choice="experienced" aria-pressed="${choice === 'experienced'}"><span class="radio" aria-hidden="true"></span><span class="option-icon" aria-hidden="true">☷</span><strong>Ya tengo materias cursadas</strong><small>Quiero marcar mis avances y ver qué materias puedo cursar después.</small></button>
  </div><button class="later ${choice === 'later' ? 'selected' : ''}" data-choice="later" aria-pressed="${choice === 'later'}">Prefiero hacerlo después <span aria-hidden="true">→</span></button>
  <div class="notice"><span aria-hidden="true">ⓘ</span><p>Esta demo incluye <b>2 materias con progreso previo</b>. Se conservan en todas las opciones: empezar no significa reiniciar.</p></div>
  <div class="actions"><small>Podés revisar y corregir todo antes de confirmar.</small><button class="primary" data-action="continue">${choice === 'experienced' ? 'Configurar mis materias' : choice === 'starting' ? 'Continuar sin cargar estados' : 'Continuar después'} →</button></div></section>`
}
function workspace() {
  return `<div class="page-heading"><div><p class="eyebrow">Carga académica · Demo</p><h1 tabindex="-1">Poné al día tu recorrido</h1><p>Seleccioná varias materias y asignales un estado en conjunto.</p></div><div class="progress-card"><strong>${Object.keys(decisions).length} de ${editable.length} materias revisadas</strong><progress value="${Object.keys(decisions).length}" max="${editable.length}" aria-label="Progreso de revisión"></progress><small>2 previas protegidas · No es porcentaje aprobado</small></div></div>
  <div class="toolbar"><strong class="selection-count" aria-live="polite">${selected.size} seleccionada${selected.size === 1 ? '' : 's'}</strong>${statuses.map((state,i) => `<button class="status ${classes[i]}" data-status="${state}" ${selected.size ? '' : 'disabled'}>${marks[i]} ${state}</button>`).join('')}<span class="spacer"></span><button class="text-button" data-action="clear" ${selected.size ? '' : 'disabled'}>Limpiar selección</button><button data-action="undo" ${history.length ? '' : 'disabled'}>↶ Deshacer</button></div>
  ${[1,2].map(year => `<h2 class="year">${year}.º año</h2><div class="period-grid">${[...new Set(subjects.filter(s => s.year === year).map(s => s.period))].map(period => {
    const group = subjects.filter(s => s.year === year && s.period === period), available = group.filter(s => !s.saved)
    const key = group[0].id
    return `<section class="period"><div class="period-header"><strong>${period}</strong><label><input id="group-${key}" type="checkbox" data-group="${key}" ${available.every(s => selected.has(s.id)) ? 'checked' : ''}> Seleccionar grupo</label></div>${group.map(s => `<label class="subject ${s.saved ? 'protected' : selected.has(s.id) ? 'selected' : ''}">${s.saved ? '<span class="lock" aria-hidden="true">▣</span>' : `<input id="subject-${s.id}" type="checkbox" data-subject="${s.id}" aria-label="Seleccionar ${s.name}" ${selected.has(s.id) ? 'checked' : ''}>`}<span class="subject-title"><strong>${s.name}</strong><small>${s.id}${s.saved ? ' · Progreso previo demo · Protegida' : ''}</small></span>${badge(s.saved || decisions[s.id])}</label>`).join('')}</section>`
  }).join('')}</div>`).join('')}
  <div class="notice"><span aria-hidden="true">ⓘ</span><p><b>Sin revisar ≠ Pendiente.</b> Sólo se incluyen las decisiones explícitas. Las equivalencias reconocidas oficialmente pueden marcarse como Aprobada; no se infieren entre carreras.</p></div>
  <div class="bottom-bar"><button class="text-button" data-step="0">← Volver</button><div><small>Los cambios todavía no se guardaron.</small><button class="primary" data-step="2">Revisar ${Object.keys(decisions).length} ${Object.keys(decisions).length === 1 ? 'cambio' : 'cambios'} →</button></div></div>`
}
function review() {
  const rows = choice === 'experienced' ? subjects.filter(s => decisions[s.id]) : []
  return `<div class="page-heading"><div><p class="eyebrow">Antes de terminar · Demo</p><h1 tabindex="-1">Revisá tu punto de partida</h1><p>${rows.length ? 'Estas son tus decisiones. Todavía podés volver y corregirlas.' : 'Continuar no borra ni reemplaza tu progreso existente.'}</p></div></div>${chip}
  <div class="summary-grid">${statuses.map(state => `<div class="summary-card">${badge(state)}<b>${rows.filter(s => decisions[s.id] === state).length}</b></div>`).join('')}</div>
  <div class="review-table">${rows.length ? `<table><thead><tr><th>Materia</th><th>Ubicación</th><th>Estado elegido</th></tr></thead><tbody>${rows.map(s => `<tr><td><b>${s.name}</b><small>${s.id} · Demo</small></td><td>${s.year}.º año · ${s.period}</td><td>${badge(decisions[s.id])}</td></tr>`).join('')}</tbody></table>` : `<div class="empty"><span class="option-icon" style="margin:auto" aria-hidden="true">○</span><h2>${choice === 'later' ? 'Lo podés configurar más adelante' : 'No hay cambios para aplicar'}</h2><p class="muted">${choice === 'starting' ? 'Empezar no marca todas las materias como Pendiente ni reinicia la carrera.' : 'Las materias sin revisar conservan su estado actual.'}</p></div>`}</div>
  <div class="notice"><span aria-hidden="true">▣</span><p><b>2 materias previas se mantienen intactas.</b> ${editable.length - rows.length} materias quedan sin una nueva decisión. La confirmación de esta demo no guarda datos.</p></div>
  <div class="bottom-bar"><button data-action="edit">← Volver a editar</button><div><small>${rows.length} ${rows.length === 1 ? 'cambio nuevo' : 'cambios nuevos'} · Sólo esta carrera demo</small><button class="primary" data-action="confirm">${rows.length ? 'Confirmar' : 'Continuar sin cambios'} · Demo ✓</button></div></div>`
}
document.addEventListener('click', event => {
  const button = event.target.closest('button')
  if (!button || button.disabled) return
  if (button.dataset.step !== undefined) { if (+button.dataset.step === 1) choice = 'experienced'; go(+button.dataset.step); return }
  if (button.dataset.choice) { choice = button.dataset.choice; render(); return }
  if (button.dataset.status) {
    history.push({ ...decisions })
    const count = selected.size
    selected.forEach(id => { decisions[id] = button.dataset.status })
    selected.clear(); render(); announce(`${count} ${count === 1 ? 'materia marcada' : 'materias marcadas'} como ${button.dataset.status}. Podés deshacer esta decisión.`); return
  }
  if (button.id === 'restart') { choice = 'experienced'; decisions = {}; selected.clear(); history = []; go(0); return }
  if (button.id === 'close-dialog') { document.getElementById('completion').close(); return }
  switch (button.dataset.action) {
    case 'continue': go(choice === 'experienced' ? 1 : 2); break
    case 'clear': selected.clear(); render(); break
    case 'undo': decisions = history.pop(); render(); announce('Se deshizo la última asignación.'); break
    case 'edit': choice = 'experienced'; go(1); break
    case 'confirm':
      document.getElementById('completion-copy').textContent = choice === 'experienced' && Object.keys(decisions).length
        ? `Revisaste ${Object.keys(decisions).length} ${Object.keys(decisions).length === 1 ? 'materia' : 'materias'}. En el flujo real, este paso confirmaría los cambios nuevos de esta carrera.`
        : 'Elegiste continuar sin cambios. Tu progreso previo se mantiene intacto.'
      document.getElementById('completion').showModal(); break
  }
})
document.addEventListener('change', event => {
  const input = event.target
  if (input.dataset.subject) { input.checked ? selected.add(input.dataset.subject) : selected.delete(input.dataset.subject) }
  else if (input.dataset.group) {
    const group = subjects.find(s => s.id === input.dataset.group)
    subjects.filter(s => !s.saved && s.year === group.year && s.period === group.period).forEach(s => input.checked ? selected.add(s.id) : selected.delete(s.id))
  } else return
  render()
})
render()
