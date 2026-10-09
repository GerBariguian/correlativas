# Onboarding académico desktop — Etapa 3

La interfaz reutiliza el dominio y el controlador de las Etapas 1 y 2. No agrega
persistencia, Rules ni habilitación de cuentas multicarrera.

## Entradas

- Legacy: al completar la elección inicial de carrera se ofrece la bienvenida.
  También se puede abrir desde «Configurar estado inicial de materias».
- Instances: después de agregar una carrera, «Seleccionar y configurar materias»
  selecciona explícitamente la instancia nueva y abre el recorrido. Agregarla no
  la selecciona automáticamente. Requiere las capacidades existentes del Bridge.
- Las tres opciones iniciales conservan el progreso previo. «Estoy empezando» y
  «Después» no generan estados ni reinician materias.

La carga agrupa según año/período reales; distingue Sin revisar de Pendiente,
protege toda clave registrada, permite selección múltiple, Deshacer/Rehacer y
revisión. Sólo confirmar llama al controlador de guardado. Al salir se vuelve a
leer el progreso. Un cambio de contexto invalida el recorrido; los errores no se
interpretan como progreso vacío ni se reintentan escrituras automáticamente.

## Prueba manual segura

Seguir los dos terminales de [manual-emulator.md](manual-emulator.md): primero
Auth/Firestore con `firebase.emulators.json` y proyecto
`demo-correlativas-manual`; después `npm.cmd run dev:emulator`.
Abrir exclusivamente http://127.0.0.1:5174 y comprobar «Emulator local».
Usar una identidad ficticia del popup de Auth Emulator, nunca una cuenta real.
No usar `npm run dev` normal para probar el flujo con persistencia.

1. Con una cuenta ficticia legacy nueva, elegir carrera y abrir la bienvenida.
2. Elegir «Ya tengo materias cursadas», seleccionar varias materias, asignar
   estados, deshacer/rehacer y revisar. Todavía no se guarda progreso.
3. Confirmar una vez y pulsar «Ir a mi carrera». Verificar estados y reabrir:
   las materias guardadas, incluso Pendiente, deben estar protegidas.
4. Probar «Estoy empezando», «Después» y salir sin confirmar: sin cambios.
5. Multicarrera sólo con una cuenta sintética ya preparada en Emulator con
   autoridad instances/complete. Este nodo no crea controles ni migra cuentas.

## Validación de esta entrega

- UI e integración App/MyCareers: 21/21 PASS.
- Suite Node completa: 1078/1078 PASS, 0 FAIL, 0 skipped.
- Build PASS; permanece la advertencia de bundle mayor a 500 kB.
- Persistencia/Rules sin cambios. La acreditación Emulator 22/22 de Etapa 2
  es previa; no constituye una nueva prueba end-to-end de esta interfaz.
- La inspección visual automatizada del componente React con datos ficticios
  no pudo completarse: el navegador de herramientas no accedió al servidor
  local (connection refused/timeout).
- Revisión visual manual de la interfaz real en Firebase Emulator: aprobada
  por el usuario, incluida la corrección de la barra horizontal de estados.
  El selector local de la barra fija `flex-direction: row` y conserva wrap,
  evitando la dirección vertical de `.toolbar` global sin alterar otras vistas.
  Tras esa corrección: 21/21 tests focalizados, build y diff check PASS.

Responsive básico incluido; gestos mobile, persistencia del borrador tras cerrar
la página y Etapa 4 quedan fuera de alcance. El prototipo aprobado se conserva.
