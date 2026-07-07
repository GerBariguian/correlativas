import {
  subjects as informaticaSubjects,
  initialStatus as informaticaStatus,
} from './uade/informatica'

import {
  subjects as industrialSubjects,
  initialStatus as industrialStatus,
} from './uade/industrial'

import {
  subjects as odontologiaSubjects,
  initialStatus as odontologiaStatus,
} from './uba/odontologia'

export const careers = [
  {
    id: 'uade-informatica',
    university: 'UADE',
    faculty: 'Ingeniería y Ciencias Exactas',
    name: 'Ingeniería en Informática',
    plan: '1621',
    subjects: informaticaSubjects,
    initialStatus: informaticaStatus,
  },
  {
    id: 'uade-industrial',
    university: 'UADE',
    faculty: 'Ingeniería y Ciencias Exactas',
    name: 'Ingeniería Industrial',
    plan: 'A confirmar',
    subjects: industrialSubjects,
    initialStatus: industrialStatus,
  },

  {
    id: 'uba-odontologia',
    university: 'UBA',
    faculty: 'Facultad de Odontología',
    name: 'Odontología',
    plan: '2021',
    subjects: odontologiaSubjects,
    initialStatus: odontologiaStatus,
  },
]