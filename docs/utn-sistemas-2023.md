# UTN Buenos Aires — Sistemas de Información, Plan 2023

Registro: `utn-sistemas-2023`, Facultad Regional Buenos Aires, Ordenanza 1877.
Es una carrera independiente de las dos versiones de Ingeniería Industrial.

## Fuentes y precedencia

- La fotografía de la grilla aportada por el usuario determina nivel, modalidad,
  horas semanales y distribución de electivas. No se sustituye por modalidades
  alternativas de programas individuales. Los niveles locales pueden diferir de
  los del PDF de correlatividades (por ejemplo, Inglés I y Ciencia de Datos).
- [PDF oficial de correlatividades](https://frba.utn.edu.ar/wp-content/uploads/2023/11/Correlativas-plan-2023.pdf),
  también aportado como `Correlativas-plan-2023.pdf`: numeración y requisitos
  académicos. Sus columnas «Cursadas» y «Aprobadas» se aplican para cursar y rendir.
- [Plan oficial](https://frba.utn.edu.ar/sistemas/plan-de-estudios-2023/) y
  [Ordenanza 1877](https://frba.utn.edu.ar/wp-content/uploads/2022/12/Ordenanza-1877-Plan-ISI2023.pdf).

Los códigos `UTN-ISI23-01` a `UTN-ISI23-36` son identificadores internos basados
en la numeración del PDF, no códigos de SIU/Guaraní.

## Elementos y calendario

Hay **44 elementos académicos**: las 36 asignaturas numeradas (incluido Proyecto
Final), siete slots electivos y una PPS. Seminario Integrador no se incorpora:
la grilla lo identifica como obligatorio únicamente para el título intermedio.

Las 17 anuales usan `durationPeriods: 2` y `allowedStartTerms: ['1C']`:

| Nivel de la grilla | Asignaturas anuales |
| --- | --- |
| 1 | Análisis Matemático I; Álgebra y Geometría Analítica; Física I; Lógica y Estructuras Discretas; Algoritmos y Estructuras de Datos; Arquitectura de Computadoras; Sistemas y Procesos de Negocio |
| 2 | Inglés I; Análisis Matemático II; Física II; Sintaxis y Semántica de los Lenguajes; Paradigmas de Programación; Análisis de Sistemas de Información |
| 3 | Inglés II; Diseño de Sistemas de Información |
| 4 | Administración de Sistemas de Información |
| 5 | Proyecto Final |

Cada anual ocupa un cupo en 1C y otro en 2C del mismo año; recién queda Regularizada
al cerrar 2C. Su continuación no es otra asignatura ni puede quitarse aisladamente.
Ingeniería y Sociedad dura un período y tiene `allowedStartTerms: ['2C']`.
Las demás cuatrimestrales pueden comenzar en ambos términos: no se inventa oferta
semestral donde la grilla no la especifica. `year` solo orienta el desempate del
ranking; no impone requisitos académicos.

`hours` de las asignaturas representa horas cátedra semanales según la grilla,
con `hoursUnit` explícito. No se utiliza para calcular cupos ni horas totales.

## Electivas y PPS

`UTN-ISI23-E1` a `E7` representan Electiva I (nivel 3), II y III (nivel 4), IV a
VII (nivel 5). Cada slot es cuatrimestral, de 6 horas semanales, dando 6/12/24
horas por nivel. No se carga la oferta concreta ni se inventan correlativas.
La elegibilidad de una oferta electiva específica queda fuera de este catálogo.

`UTN-ISI23-PPS` usa `projectionKind: 'activity'`, 200 horas reloj totales.
Participa en el progreso y en la completitud académica, pero no consume cupos,
no tiene fecha automática y no admite eventos de final como acreditación.
Para iniciar/acreditar exige las mismas regularizaciones y aprobaciones que
para inscribirse a Proyecto Final. No exige tener aprobado Proyecto Final.

## Correlativas y Proyecto Final

`prereqs` requiere Regularizada o Aprobada; `approvedPrereqs` exige Aprobada.
`finalPrereqs` reproduce la columna de aprobadas, sin convertir las cursadas
en aprobaciones. La validación del progreso conserva también los requisitos
de cursada de una materia ya cursada. El motor nunca aprueba finales solo por
haber terminado la cursada.

Para cursar Proyecto Final se requieren regularizadas Ingeniería y Calidad de
Software, Redes de Datos y Administración de Sistemas de Información; aprobadas
Inglés II, Desarrollo de Software y Diseño de Sistemas de Información.
Su duración anual se expresa con la misma metadata que las otras anuales.

Para rendirlo se exige aprobar las 35 asignaturas numeradas previas y los siete
slots electivos. No se usa `ALL`, cuya semántica histórica excluye electivas.
PPS no es correlativa de Proyecto Final: compartir requisitos de inicio no crea
una dependencia entre ambas. La frase «Última Exigencia Académica» de la grilla
no agrega requisitos que el documento de correlatividades no establece.
La condición de rendición no se traslada a la habilitación para cursar.

## Validación y límites

Los tests verifican los 36 pares de columnas, 44 códigos únicos, niveles,
modalidades, electivas, PPS, Proyecto Final, selector UTN, mapa, continuaciones
y edición manual. El registro completo se proyecta con cargas 3, 4, 5, 7 y 9
desde progreso inicial y desde progreso coherente con materias Cursando.

Sin eventos de aprobación la proyección se detiene en requisitos de aprobadas;
no es un error ni una fecha estimada de graduación. Las materias inicialmente
Cursando conservan la política general del motor: se supone que terminan al
cierre del primer período, porque no se conoce su fecha real de inicio.
No se modelan vencimientos de regularidad, excepciones administrativas ni oferta
real de electivas. La carga en cupos no equivale a una carga horaria uniforme.
