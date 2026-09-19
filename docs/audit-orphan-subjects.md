# Auditoría local de subjects huérfanos

Esta herramienta NO se ejecuta como parte de los tests ni del build. Cualquier
ejecución real requiere autorización separada. No configura IAM, obtiene tokens,
inicia sesión ni descubre configuración de Firebase, Vite o archivos .env.
No requiere dependencias adicionales (Node 22+).

## Ejecución futura, solo tras autorización

Proyecto y base son obligatorios, incluyendo `(default)` cuando corresponda.
La identidad del token debe tener únicamente permisos efectivos de lectura
`datastore.entities.get` y `datastore.entities.list`. Agregar un rol lector a
un usuario administrador no restringe sus permisos preexistentes.

Ejemplo PowerShell con placeholders: el token temporal se introduce mediante
entrada oculta, no como argumento, literal en el historial ni archivo. Este
ejemplo no obtiene credenciales ni hace login.

```powershell
$auditSecret = Read-Host 'TOKEN_OAUTH_TEMPORAL' -AsSecureString
$auditCredential = [System.Net.NetworkCredential]::new('', $auditSecret)
$auditCredential.Password | node scripts/audit-orphan-subjects.cjs --project-id PROJECT_ID --database-id DATABASE_ID --token-stdin
$auditCredential = $null
$auditSecret = $null
```

El token existe transitoriamente en memoria. No activar transcripciones, trazas
HTTP o depuradores que registren secretos. La herramienta no escribe archivos.
La salida JSON puede contener rutas sensibles: no agregarla al repositorio.

## Lecturas y completitud

El transporte fija HTTPS y `firestore.googleapis.com`, rechaza redirecciones y
solo permite `documents:runQuery` y `documents:batchGet`. No tiene operaciones
de escritura. IAM lector es la protección del servidor; no depende de Rules.

Un sondeo `subjects` con límite 1 obtiene T. Después se recorre el grupo completo
sin límite, con proyección explícita `__name__`, y se validan proyecto/base y la
forma exacta `jointPlans/{planId}/subjects/{code}`. Otros subjects se cuentan
fuera de alcance. Los padres se deduplican y leen en lotes de 100 con máscara
vacía explícita. Se enumera toda la colección raíz `jointPlanTombstones`.
Todas esas lecturas usan el mismo T. No se recuperan campos de negocio.

Cada respuesta HTTP debe terminar correctamente con un array JSON completo.
No hay paginación, límite global ni reanudación silenciosa: cada consulta se
consume íntegra. Hay un máximo de 64 MiB por respuesta y 30 segundos por petición.
Excederlos, agotar la ventana de readTime, recibir rutas inconsistentes, errores,
duplicados o padres sin respuesta produce C. No se reintenta con otro T.
Firestore normalmente permite readTime dentro de la última hora; esta herramienta
no habilita PITR ni modifica configuración. Si el volumen excede estos límites,
se requiere revisar un diseño de paginación antes de una nueva implementación.

Resultados y códigos de salida:

- A / 0: recorrido completo y ausencia demostrada a T en la base indicada.
- B / 1: recorrido completo con uno o más huérfanos confirmados.
- C / 2: configuración inválida o auditoría incompleta. Los contadores pueden ser
  parciales; nunca significan ausencia. Si ya hubo huérfanos confirmados se
  conservan como evidencia, pero el resultado global sigue siendo C.

`tombstoneExistsAtT: null` indica que no pudo completarse la enumeración de
tombstones; false solo se emite si esa enumeración terminó. `padresSinResolver`
cubre padres descubiertos: cero no acredita que el recorrido de subjects terminara.
Errores solo contienen etapa y código fijo, nunca respuestas o excepciones.

La auditoría no prueba ausencia después de T ni detecta IDs que ya fueron
reutilizados y tienen padre a T. Tombstones existentes se cuentan y se cruzan
con huérfanos; no se presume su procedencia o legitimidad. No se planifica ni
ejecuta limpieza. Las lecturas pueden generar costos y registros de acceso.

## Tests sin red

```text
node --test tests/audit-orphan-subjects.test.cjs
npm.cmd test
```

Todos los tests inyectan fetch simulado con Response estándar; no abren sockets,
usan emuladores, obtienen credenciales ni llaman a APIs externas.
