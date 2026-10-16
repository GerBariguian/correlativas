const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true })
export const normalizeSearch = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim()
export const matchesSearch = (label, query) => normalizeSearch(query).split(/\s+/).every(part => normalizeSearch(label).includes(part))
export const careerKey = catalog => JSON.stringify([catalog.name, catalog.faculty ?? ''])
export function universities(catalogs, query = '') {
  return [...new Set(catalogs.map(c => c.university))].filter(name => matchesSearch(name, query)).sort(collator.compare)
}
export function careerChoices(catalogs, university, query = '') {
  const choices = new Map()
  for (const c of catalogs) if (c.university === university) choices.set(careerKey(c), { key: careerKey(c), name: c.name, faculty: c.faculty ?? '' })
  return [...choices.values()].filter(c => matchesSearch(`${c.name} ${c.faculty}`, query)).sort((a,b) => collator.compare(a.name,b.name) || collator.compare(a.faculty,b.faculty))
}
export function planChoices(catalogs, university, key) {
  return catalogs.filter(c => c.university === university && careerKey(c) === key).sort((a,b) => collator.compare(a.plan,b.plan) || collator.compare(a.id,b.id))
}
export const compareCatalogs = (a,b) => collator.compare(a?.name ?? '',b?.name ?? '') || collator.compare(a?.university ?? '',b?.university ?? '') || collator.compare(a?.plan ?? '',b?.plan ?? '')
