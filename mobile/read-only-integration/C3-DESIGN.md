# C3: diseño y contrato de consumo

C3 incorpora lecturas puntuales con control de vigencia, sin listeners Firestore, polling ni reintentos automáticos. C2 permanece sin cambios. No hay UI de C4/C5 ni integración con la web productiva.

## Responsabilidades

- `academicSessionController.mjs`: recibe `{ connect }` por inyección. El dueño local puede inyectar `connectAcademicLab` de C2; nunca auth/db productivos. Cada conexión produce un objeto `connection` con identidad opaca `id` nueva, uid, `isCurrent()`, `readProgress(scope)` y `subscribeInvalidation(listener)`. Solo el dueño de sesión cierra clientes.
- `academicQueryController.mjs`: por consumidor. Reutiliza `onboardingScopeKey` (uid, model, id, catalogId), copia el scope y controla una generación por consulta. Toda actualización elimina el progreso anterior antes de invocar la lectura. El progreso publicado se clona y congela. Solo `loaded` contiene `progress`.
- `useAcademicRead.js`: recibe connection y scope; retorna el estado más `refresh()`. Se suscribe realmente con `useSyncExternalStore` y desuscribe en cleanup. Cambiar conexión o identidad crea un controlador de consulta nuevo y puro, sin iniciar recursos durante render. Antes de los efectos, `academicQueryView` vuelve a comparar la identidad completa y vigencia de conexión: datos anteriores no se exponen durante la transición.

Estados de consulta: idle, loading, loaded, absent, error, blocked y archived. La sesión tiene idle, loading, ready y error; ready describe una conexión, no progreso académico.

## Ciclo de vida

1. Crear un controlador de sesión por dueño local, nunca a nivel global compartido entre usuarios.
2. Suscribirse al snapshot de sesión; conectar explícitamente una fixture permitida de C2.
3. Pasar `snapshot.connection` cuando la sesión esté ready y el scope completo al hook.
4. Cambios de contexto disparan una lectura puntual. La actualización manual llama a refresh; no retiene progreso durante loading.
5. Una respuesta solo publica si coinciden el binding, generación y conexión vigente; se valida además la identidad del resultado. Esto cubre A → B → A y reconexión con el mismo uid.
6. Desmontar el consumidor cancela su vigencia y retira sus suscripciones, sin cerrar una conexión compartida. Setup → cleanup → setup permite una lectura nueva.
7. Cambiar usuario o desconectar invalida sincrónicamente todas las consultas suscritas, retira el progreso y luego cierra el cliente. Una conexión que llega tarde se cierra sin publicarse.
8. `disconnect()` permite reconectar. Usar disconnect, no dispose, en cleanup de un efecto de dueño susceptible al ciclo adicional de Strict Mode. `dispose()` es terminal y reservado al dueño que termina definitivamente su ciclo de vida; reconectar tras dispose rechaza C3_SESSION_DISPOSED.

## Cancelación y errores

La cancelación de consultas es lógica: no aborta físicamente un getDocFromServer ya iniciado. No se introduce un AbortSignal ficticio. La desuscripción de callbacks sí elimina recursos propios del controlador; close de C2 elimina su app. Ninguna cancelación detiene B o Vite Preview.

El controlador captura tanto rechazos como resultados error de C2. Errores y respuestas antiguos se descartan; ningún estado distinto de loaded incorpora progreso. Fallos de cierre dejan la conexión invalidada y se informan como C3_CLOSE_FAILED. El controlador falla cerrado ante nuevos intentos después de un fallo de cierre: no supone que el recurso se liberó. No hay reintentos automáticos. No se ofrece garantía de recuperación de un SDK que falla al cerrar.

Si falla el cierre de un cliente que terminó de conectarse tarde, la promesa de connect devuelve `{ code: 'C3_LATE_CLOSE_FAILED', closeError }`; el dueño debe observar esa promesa y reportar el diagnóstico sin sobrescribir la sesión nueva. Dispose no espera conexiones de red pendientes indefinidamente; su finalización tardía sigue protegida y debe observarse mediante la promesa original.

## Build

`vite.c3.config.mjs` genera `dist/c3/academic-consumer.mjs` desde `c3.mjs`. React se mantiene como dependencia externa para evitar una segunda copia al consumir la biblioteca. Se conserva el mismo plugin de frontera y la CSP C1; no se amplía el allowlist de src. Los controladores y hook no importan SDK, servicios productivos o APIs de escritura. La configuración inmutable de endpoints y persistencia en memoria continúa siendo responsabilidad del cliente C2 inyectado.
