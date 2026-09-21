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

import {
  subjects as teologiaSubjects,
  initialStatus as teologiaStatus,
} from './uca/teologiaSistematica'

import {
  subjects as actuarioSubjects,
  initialStatus as actuarioStatus,
} from './uba/actuario'

import {
  subjects as industrial2023Subjects,
  initialStatus as industrial2023Status,
} from './utn/industrial2023'

import {
  subjects as industrial2007Subjects,
  initialStatus as industrial2007Status,
} from './utn/industrial2007'

import {
  subjects as sistemas2023Subjects,
  initialStatus as sistemas2023Status,
} from './utn/sistemas2023'

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

  {
    id: 'uba-actuario',
    university: 'UBA',
    name: 'Actuario',
    plan: 'Único',
    subjects: actuarioSubjects,
    initialStatus: actuarioStatus,
  },

  {
    id: 'uca-teologia-sistematica',
    university: 'UCA',
    faculty: 'Facultad de Teología',
    name: 'Licenciatura en Teología Sistemática',
    plan: 'A confirmar',
    subjects: teologiaSubjects,
    initialStatus: teologiaStatus,
  },

  {
    id: 'utn-industrial-2023',
    university: 'UTN',
    name: 'Ingeniería Industrial',
    plan: 'I-23 (2023)',
    subjects: industrial2023Subjects,
    initialStatus: industrial2023Status,
  },  
  {
    id: 'utn-industrial-2007',
    university: 'UTN',
    name: 'Ingeniería Industrial',
    plan: '2007',
    subjects: industrial2007Subjects,
    initialStatus: industrial2007Status,
  },
  {
    id: 'utn-sistemas-2023',
    university: 'UTN',
    faculty: 'Facultad Regional Buenos Aires (FRBA)',
    name: 'Ingeniería en Sistemas de Información',
    plan: '2023',
    ordinance: '1877',
    subjects: sistemas2023Subjects,
    initialStatus: sistemas2023Status,
  },
]
