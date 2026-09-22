export const plannerOfferingWarning = 'El catálogo no confirma el dictado en este período. Verificá la oferta antes de inscribirte.'

export function plannerSelectionReason(item, nameOf) {
  if (item.errors.length) return 'No disponible: el código o sus datos no permiten analizar esta materia.'
  if (item.kind === 'activity') return 'Actividad no calendarizable: no cuenta como cursada ni aporta al impacto.'
  if (item.academicState === 'blocked') {
    return ['No disponible.', item.missing.regularized.length ? `Falta regularizar: ${item.missing.regularized.map(nameOf).join(', ')}.` : '',
      item.missing.approved.length ? `Falta aprobar: ${item.missing.approved.map(nameOf).join(', ')}.` : ''].filter(Boolean).join(' ')
  }
  if (item.academicState !== 'eligible') return `No disponible: ya está ${item.academicState.toLowerCase()}.`
  if (item.start === 'incompatible') return 'Inicio incompatible con el período elegido. Se conserva fuera del impacto válido.'
  return 'Válida académicamente para el análisis condicional.'
}

export function plannerHours(subjects, evaluation) {
  const codes = new Set(evaluation.selection.filter(s => s.selectable).map(s => s.code))
  const courses = subjects.filter(s => codes.has(s.code))
  if (!courses.length || courses.some(s => s.hoursUnit !== 'horas cátedra semanales' || !Number.isFinite(s.hours) || s.hours < 0)) return null
  return courses.reduce((total, s) => total + s.hours, 0)
}
