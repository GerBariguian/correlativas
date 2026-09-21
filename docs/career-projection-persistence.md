# Persistencia privada de Proyectar carrera

Una planificación por `users/{uid}/careerProjections/{careerId}`. El ID es el
`career.id` del registro. No hay consultas de colección ni índices adicionales.

## Contrato versión 1

```js
{
  schemaVersion: 1,
  careerId: 'utn-sistemas-2023',
  revisionToken: '<UUID de revisión>',
  scenario: {
    startPeriod: { year: 2027, term: '1C' },
    initialCapacity: 4,
    maxPeriods: 40,
    capacities: [],
    manualPeriods: [],
    finalEvents: []
  },
  updatedAt: '<serverTimestamp>'
}
```

Solo se guardan decisiones. `manualPeriods` guarda la selección completa del
período editado; `codes: []` significa dejarlo manualmente vacío. Las continuaciones,
ranking, diagnósticos, fechas y estados simulados se recalculan. No se guarda el
progreso real. `finalEvents` debe estar vacío: no hay editor de finales.

La normalización rechaza campos desconocidos, períodos/códigos duplicados y tipos
inválidos. Admite 40 entradas por lista de ajustes, 1000 códigos por selección,
años 1–9979 y capacidades enteras exactas. Conserva intenciones académicamente
inválidas, incluidos códigos retirados o períodos anteriores al nuevo inicio:
corresponde al motor diagnosticarlas.

## Lifecycle y autosave

El hook en App conserva un coordinador por sesión/carrera aunque se desmonte la
página o se cambie de carrera. No hay cola duradera en disco. La carga es desde el
servidor; error o versión desconocida nunca equivalen a ausencia. Abrir la página
o editar el formulario inicial no escribe.

La primera generación válida guarda inmediatamente. Las ediciones usan debounce
de 800 ms y comparación normalizada. Solo hay una escritura en curso por contexto;
se conserva la última versión local, sin enviar estados intermedios. Renders y
recálculos no guardan. «Guardado» requiere confirmación. Cambiar sesión cancela
debounces e invalida callbacks/transacciones todavía no confirmadas; no deshace
una operación que el servidor ya confirmó.

Al volver se refresca una planificación limpia. Un borrador pendiente, error o
conflicto se conserva localmente. Cada transacción compara la revisión esperada
y genera un token nuevo. Una discrepancia impide sobrescribir la versión remota
y muestra conflicto; no hay fusión ni resolución avanzada entre dispositivos.
Recargar el navegador descarta el borrador no confirmado y lee la versión remota.

Cambiar carga/período conserva `manualPeriods`, sin botón Guardar ni Recalcular.
La fecha real no desplaza el período inicial. Una primera propuesta inválida se
muestra para diagnóstico pero no se persiste.

## Progreso y decisiones inválidas

Mientras la sección está visible, App suscribe el documento de progreso en
reemplazo de la lectura puntual. Ignora snapshots de caché o pendientes y conserva
controles de sesión/carrera. Espera la cola anterior antes de iniciar la lectura.
Al salir cancela la suscripción: no quedan dos cargadores activos.

Cambiar `statusMap` recalcula sin autosave. Ninguna acción del nuevo servicio lo
escribe. El motor no cambia: si un error estructural invalida todo el escenario,
la UI muestra su diagnóstico y selecciones conservadas, que pueden liberarse
expresamente sin ocultar errores ni modificar el progreso.

## Reinicio

Requiere confirmación. Cancela el debounce, bloquea ediciones, espera la escritura
en curso y elimina solo la proyección con transacción/revisión. Limpia la UI tras
confirmar la eliminación. Un error/conflicto conserva el escenario; reintentar una
eliminación fallida reintenta eliminar, no guardar. Una escritura anterior del
mismo contexto no puede recrear después el documento.

## Seguridad y límites

Rules permite `get/create/update/delete` solo al propietario y deniega `list`.
Valida campos exactos del documento y escenario, carrera, versión, token, timestamp,
período inicial, capacidad y límites de listas. Rechaza statusMap, sharing y datos
derivados fuera del esquema en esos niveles; exige `finalEvents: []`.
Los elementos internos de las listas se validan completamente al serializar y
deserializar en el cliente. Rules no valida catálogo/elegibilidad; un documento
malformado creado por su dueño se rechaza al cargarlo.

Amistades, sharing y membresía nunca autorizan esta ruta. El servicio no usa
savePlanningProgress, snapshots ni jointPlans. No hay garantía de recuperación
tras cerrar el navegador durante Guardando/Error, ni persistencia offline nueva.
No se resuelve aquí la edición concurrente del progreso en otras pantallas.

## Validación

`npm.cmd run test:projection` incluye motor, UI, persistencia, reloj inyectable y
lifecycle simulado del hook real. Rules se prueba únicamente en Emulator demo.
Revisión manual posterior: dos pestañas, desconexión, navegar antes del debounce,
cambiar carrera, actualizar progreso desde otro dispositivo y reiniciar mientras
guarda. El uso remoto requiere Rules compatibles publicadas; este trabajo no
realiza ese despliegue.
