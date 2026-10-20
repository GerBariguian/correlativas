import { subjects as systems } from '../../src/data/utn/sistemas2023.js'
import { subjects as industrial23 } from '../../src/data/utn/industrial2023.js'
import { subjects as industrial07 } from '../../src/data/utn/industrial2007.js'

export function freezeCatalogValue(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freezeCatalogValue); Object.freeze(value) }
  return value
}
// Own copies: never freeze or mutate the shared catalog modules. No initialStatus.
export const UTN_CATALOGS = freezeCatalogValue({
  'utn-sistemas-2023': { catalogId: 'utn-sistemas-2023', subjects: structuredClone(systems) },
  'utn-industrial-2023': { catalogId: 'utn-industrial-2023', subjects: structuredClone(industrial23) },
  'utn-industrial-2007': { catalogId: 'utn-industrial-2007', subjects: structuredClone(industrial07) },
})
export function getUTNCatalog(catalogId) {
  return Object.hasOwn(UTN_CATALOGS, catalogId) ? UTN_CATALOGS[catalogId] : null
}
