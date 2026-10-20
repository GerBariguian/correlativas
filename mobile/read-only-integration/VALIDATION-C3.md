# C3: validación local del 20 de octubre de 2026

Implementación limitada a mobile/read-only-integration/. Contrato C2, src, B, fixtures y Rules sin modificar. Sin instalaciones, commit, push, migraciones o escrituras académicas.

## Comandos desde la raíz

Ejecutar en orden, comprobando salida cero. B debe estar previamente disponible con sus fixtures; estos comandos no lo inician ni siembran.

```powershell
node node_modules/vite/bin/vite.js build --config mobile/read-only-integration/vite.config.mjs
node node_modules/vite/bin/vite.js build --config mobile/read-only-integration/vite.c2.config.mjs
node node_modules/vite/bin/vite.js build --config mobile/read-only-integration/vite.c3.config.mjs
node node_modules/vite/bin/vite.js build --config mobile/read-only-integration/vite.c3-manual.config.mjs
node --test mobile/read-only-integration/isolation.test.mjs mobile/read-only-integration/academicRead.test.mjs mobile/read-only-integration/academicDecoders.test.mjs mobile/read-only-integration/academicQueryController.test.mjs mobile/read-only-integration/academicSessionController.test.mjs mobile/read-only-integration/useAcademicRead.test.mjs
node mobile/read-only-integration/run-integration.cjs
node mobile/read-only-integration/run-c3-integration.cjs
git diff --check
```

## Evidencia

- 16 tests previos de C1/C2 y 19 tests nuevos C3: controladores deterministas, contrato de render y control de imports; aprobados sin omisiones.
- Pruebas deterministas: A → B → A fuera de orden; cada campo de identidad y conexión; refresh consecutivos; éxitos y errores tardíos; cancelación/desuscripción; dos consumidores; invalidación sincrónica; copia inmutable del progreso; resultados malformados; conexión tardía y su cierre; reconexión con mismo uid; errores de conexión/cierre; disconnect seguido de reconnect mientras el cierre sigue pendiente; dispose idempotente.
- React real mediante react-dom/server: estados iniciales loading/idle/error sin progreso y sin iniciar lecturas. Esto no monta efectos ni certifica el hook en un navegador.
- Regresión C2 contra SDK/Emulator reales: 13 subtests aprobados (14 contando el contenedor), conservando la prueba separada de Rules.
- Integración C3: 5 subtests aprobados (6 contando el contenedor). Sistemas / Industrial y refresh; lecturas reales cuyas entregas se retienen para A → B → A; indisponibilidad aislada y recuperación manual; cambio a usuario legacy y rechazo OWNER_MISMATCH; cleanup del consumidor preserva conexión compartida y disconnect invalida consultas.
- Las pruebas reales usan únicamente lab-instances y lab-legacy para C3, y las fixtures originales para la regresión C2. No se alteran documentos para fabricar carreras o errores.
- El runner C3 reutiliza el guard de red C2 y un entorno construido por lista permitida. Se verifican destinos únicamente 127.0.0.1:9199 y 8188 y cero intentos a destinos externos. La caída simulada existe solo en fetch del proceso de pruebas y se revierte en finally. No se detienen servicios del usuario.
- Builds C1/C2/C3 y frontera de imports aprobados. React externo en la biblioteca C3. Todos los generados de dist ignorados por Git; diff sin errores de whitespace y sin cambios fuera del alcance.

## Límites

El montaje real del hook en Chrome y las transiciones de la pantalla aislada cuentan ahora con validación manual del usuario, detallada abajo. No se afirma automatización de Chrome por el agente ni cobertura automatizada DOM de efectos/props. La prueba determinista setup → cleanup → setup del controlador y el render SSR siguen siendo evidencia distinta. La pantalla incorpora React de desarrollo y StrictMode; sus contadores no constituyen una certificación exhaustiva de todos los escenarios concurrentes de React. No se instalaron dependencias de DOM/testing.

La integración automatizada corre en Node con el bundle y un location de prueba, como en C2. La retención de entregas controla el orden de publicación después de lecturas reales; no modifica el transporte ni demuestra aborto de RPC. No se acredita caída física de Firestore durante una petición ni auditoría de CSP/almacenamiento del navegador. La guardia es local al proceso, no un firewall del sistema.

Las garantías de autoridad y ausencia de snapshot atómico de C2 permanecen iguales. Sin listeners ni polling, un estado loaded refleja la última lectura explícita y no detecta inmediatamente cambios externos de autoridad/archivo. C3 no incorpora signOut ni nuevos estados de autenticación del SDK; usa cierre de la app aislada. Fallos de cierre son explícitos, no garantizan liberación física del SDK.

Advertencias conservadas: chunk C1 mayor a 500 kB y MODULE_TYPELESS_PACKAGE_JSON al cargar ESM desde paquetes existentes sin type module. No se modifican manifiestos para silenciarlas.

## Validación manual en Chrome comunicada por el usuario

Fuente: capturas y observaciones manuales realizadas por el usuario en Chrome con la pantalla aislada c3-manual.html y Firebase Emulator, comunicadas en esta conversación. No son resultados de automatización de Chrome por el agente. Computer Use había detenido su intento previo al no poder determinar con confianza la URL activa; ese intento no se cuenta como prueba aprobada.

| Caso manual | Resultado observado por el usuario |
|---|---|
| Conexión lab-instances | sesión ready; estado loaded; revisión 7; cuatro materias; violaciones 0 |
| Sistemas → Industrial | loaded; revisión 1; cero materias; violaciones 0 |
| Industrial → Sistemas | revisión 7; cuatro materias originales; violaciones 0 |
| Actualización manual | loaded; revisión 7; cuatro materias; violaciones 0 |
| Desmontaje del consumidor | sin progreso visible; sesión compartida ready; violaciones 0 |
| Nuevo montaje | loaded; revisión 7; cuatro materias; violaciones 0 |
| Desconexión | sesión idle; estado idle; sin progreso; cero materias; violaciones 0 |
| Conexión lab-legacy | loaded; modelo legacy; revisión null; cuatro materias; violaciones 0 |
| Reconexión lab-instances | loaded; revisión 7; cuatro materias; violaciones 0 |
| Industrial 2007 archivada | archived; sin progreso; cero materias; violaciones 0 |
| Otro propietario | blocked; motivo OWNER_MISMATCH; sin progreso; cero materias; violaciones 0 |

Identificadores: lab-systems / utn-sistemas-2023; lab-industrial23 / utn-industrial-2023; lab-industrial07 / utn-industrial-2007; legacy utn-sistemas-2023 con id=catalogId. El contador de violaciones es una auditoría de renders en memoria de la pantalla de prueba: no audita la red, no demuestra ausencia de conexiones productivas en Chrome y no reemplaza el guard de los tests Node.

## Regresión final posterior a la evidencia manual

- Unitarios/SSR/imports C1–C3: 35 aprobados, 0 fallidos, 0 omitidos.
- Integración C2 local: 13 casos aprobados más 1 contenedor; Node informa 14 aprobados, 0 fallidos, 0 omitidos.
- Integración C3 local: 5 casos aprobados más 1 contenedor; Node informa 6 aprobados, 0 fallidos, 0 omitidos.
- Total reportado por Node: 55 aprobados, 0 fallidos, 0 omitidos. Excluyendo los dos contenedores: 53 pruebas/casos. Los 11 casos manuales de Chrome se documentan separadamente, sin sumarlos como tests automatizados.
- Builds aprobados: C1 (683,21 kB de JavaScript), C2 (777,71 kB), biblioteca C3 (6,58 kB) y pantalla manual (2.256,20 kB de JavaScript de desarrollo sin minificar). El tamaño de la pantalla manual corresponde al harness de prueba, no a un artefacto de producción.
- El control de imports pasó en tests y en los cuatro builds. No se amplió la lista de módulos permitidos de src ni la CSP. C3 inyecta el cliente local C2; no importa una inicialización productiva.
- Evidencia de red del proceso de integración final: C2 registró 301 peticiones y 218 sockets; C3, 115 peticiones y 86 sockets. Cero intentos denegados por destino externo; solo loopback Auth 9199 y Firestore 8188. Es evidencia acotada a esos procesos, no a Chrome ni al sistema completo.
- Los builds se ejecutaron secuencialmente sin reiniciar Preview ni emuladores. Solo se recrearon artefactos ignorados bajo dist. Sin cambios en src, B, Rules, fixtures, manifiestos o lockfiles.

Recomendación técnica: C3 está lista para preparar un commit dentro del alcance validado y con los límites de este documento. No se creó commit ni se publicó. La publicación requiere autorización expresa del usuario.
