# Correlativas Mobile — entrega 2.1

Rama independiente: `mobile/stage2-1-navigation`, creada desde el commit aprobado `9226de5b5346b457f6985e5bc02ae4042b2ef1c6`. Todos los archivos de esta entrega viven en esta carpeta. No se modifican `src/`, Firebase, Rules, Capacitor, el proyecto Android ni las demos aprobadas. No se agregan paquetes, commits, push o despliegues.

## Alcance revisable

- Barra inferior original: Inicio, Materias, Mapa y Comunidad.
- Cabecera con marca, campana y avatar; el avatar abre Cuenta.
- Inicio tiene accesos destacados a Planificar y Proyectar Carrera.
- Cuenta permite llegar a Mis carreras y a los destinos de planificación.
- Planificar conserva la selección ficticia de la demo y permite abrir Proyectar Carrera. El mapa sigue llegando a esa misma selección.
- Mis carreras muestra sólo el contexto fijo de ejemplo. No incorpora catálogos múltiples, selección, altas, archivo ni restauración (entrega 2.2 pendiente).
- Proyectar Carrera es un destino con explicación y retorno: no ejecuta el motor ni planifica períodos o finales.
- Las acciones y notas ficticias de la demo se conservan para revisar regresiones. No constituyen la implementación real del PR #4.

## Estructura

`App.jsx` es una derivación aislada de la presentación aprobada, necesaria para agregar las entradas y destinos sin modificar el prototipo congelado. Reutiliza por importación datos ficticios, CSS original, `MobileMap`, tarjetas, detalle y lógica académica; no duplica los motores ni importa servicios productivos. `NavigationPages.jsx` separa los nuevos destinos de la presentación heredada, para reemplazarlos posteriormente por componentes reales mediante props.

`navigation.mjs` define los destinos permitidos. `useNavigation.jsx` administra páginas, paneles y detalles mediante History API y hashes locales. No contiene persistencia académica ni acceso a Firebase. `main.jsx` es una entrada React separada y `vite.config.mjs` reutiliza el límite de compilación de la demo que prohíbe Firebase y elimina fuentes remotas.

## Reglas del historial

- La visita inicial no muestra Volver. Pulsar de nuevo el destino ya activo no agrega una entrada duplicada.
- Los destinos secundarios no marcan falsamente una sección principal como activa.
- Volver y Atrás del navegador recorren el mismo historial. Adelante puede restaurar la pantalla y los paneles de la sesión actual.
- Atrás cierra primero el detalle anidado de una materia, después su panel y luego vuelve a la página anterior. Escape y Cerrar usan ese historial.
- Una actividad abre la página de destino y después su panel. Cerrar deja la página de destino visible. Otro Atrás puede volver al contexto original de actividad.
- Al volver a una página se restaura su desplazamiento. La región principal recibe foco sin desplazarla al inicio. MUI conserva la gestión del foco y del modal.
- Recargar conserva el destino válido del hash, reinicia los datos ficticios y descarta paneles de la sesión anterior. Un hash desconocido se normaliza a Inicio. El hash sólo contiene un identificador de pantalla, sin perfiles o materias serializadas.
- Los borradores son los de la demo en memoria: esta entrega no promete persistencia tras cerrar el proceso. Revisitar otra materia no reutiliza el campo de nota de una materia diferente.

## Construir y revisar

Con las dependencias existentes del repositorio, desde su raíz:

```sh
node node_modules/vite/bin/vite.js build --config mobile/stage2-navigation/vite.config.mjs
node node_modules/vite/bin/vite.js preview --config mobile/stage2-navigation/vite.config.mjs --host 127.0.0.1 --port 5185 --strictPort
```

Abrir `http://127.0.0.1:5185/` **en el navegador de la misma computadora que ejecuta el servidor**. También se admiten `/#cuenta`, `/#carreras`, `/#planificador` y `/#proyeccion`.

En Codex Cloud, esta dirección es loopback de Cloud: no es una URL remota accesible desde tu PC o iPhone. No hay herramienta de vista previa remota disponible en esta sesión. No se expone el puerto a Internet ni se publica hosting. Para entregar el código o un paquete mediante GitHub sería necesario autorizar el commit y push de esta nueva rama; la autorización anterior de push correspondía únicamente a la rama Safari. La alternativa de hosting necesita autorización aparte y queda fuera de esta entrega.

Las capturas de las pantallas a 390px y de Cuenta a cinco tamaños quedan localmente en `.tools/mobile-navigation-checks/`. No son enlaces de descarga externos. Pueden mostrarse en la conversación sin publicar el sitio.

## Verificación

Después de construir:

```sh
python mobile/stage2-navigation/check.py
node mobile/stage2-navigation/regression.mjs
```

El primer comando usa Playwright/Chromium preinstalados, sin instalar herramientas. Comprueba destinos, historial, panel anidado, Escape, apertura desde actividad, foco, restauración del scroll, recarga, hash inválido, ausencia de desbordamiento horizontal global, barra inferior visible y objetivos táctiles principales de al menos 44px. Revisa anchos 320/390/430/844/1280 y un alto reducido de 340px. Registra errores JS y solicitudes externas, descargas y ventanas emergentes.

El segundo reutiliza la suite de la demo congelada sin editarla. Su único ajuste en memoria es volver explícitamente a Inicio antes de la comprobación final de reinicio al recargar: la nueva navegación conserva el hash, a diferencia de la demo anterior. Conserva las aserciones de notas ficticias, estados, mapa, selección, comunidad, notificaciones y edición en un viewport similar al teclado abierto.

Resultados documentados en `verification.json`. No equivalen a una prueba de Safari real, VoiceOver/TalkBack, teclado físico móvil ni contenedor nativo. El soporte de Atrás del navegador se verifica aquí; el adaptador nativo y la autenticación pertenecen a futuras integraciones autorizadas.

## Revisión visual sugerida

1. Inicio → Planificar → Proyectar Carrera → Volver.
2. Avatar → Cuenta → Mis carreras → Atrás/Adelante del navegador.
3. Materias → materia → detalle interno → Atrás → Escape.
4. Campana → actividad de grupo → Cerrar → Atrás; comprobar el contexto recuperado.
5. Mapa → seleccionar una materia habilitada → Mi selección.
6. Probar 320px, orientación horizontal, teclado/navegación con Tab y recarga de una pantalla secundaria.

Pendientes: revisión visual del usuario, Safari y dispositivos físicos; decidir el mecanismo de entrega remota sin despliegue. No se implementará 2.2 hasta recibir autorización.
