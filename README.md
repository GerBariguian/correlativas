# Correlativas

Asistente académico para saber qué cursar, qué rendir y qué materias te están frenando.

## Contratos de evolución

[v1.16.0 — Multicarrera, Etapa 0](docs/multicareer-v1.16-contracts.md):
arquitectura objetivo, invariantes, migración y criterios de aceptación.
Es documentación de funcionalidad futura, todavía no implementada; distingue
explícitamente los contratos históricos de v1.15 del objetivo v1.16.

## Stack

- React
- Vite
- LocalStorage
- CSS puro
- lucide-react

## Cómo correrlo

```bash
npm install
npm run dev
```

Después abrí la URL que te muestre Vite.

## Primer MVP

- Dashboard de progreso
- Estados de materias
- Podés cursar
- Podés rendir final
- Bloqueadas
- Desbloqueos
- Asesor académico básico

## Tests de seguridad

`npm.cmd run test:rules` inicia Firestore Emulator con el proyecto ficticio
`demo-correlativas-rules`, ejecuta las reglas actuales y detiene el emulador.
Requiere Java 21+; no requiere login en Firebase ni usa datos de producción.

Ver [configuración, aislamiento, matriz ALLOW/DENY y hallazgos conocidos](docs/firestore-rules-baseline-v1.9.5.md).
H5/H6 están corregidos y cubiertos por regresiones locales; el informe conserva la evidencia histórica previa.
La [herramienta de auditoría de subjects huérfanos](docs/audit-orphan-subjects.md) requiere autorización separada para cualquier ejecución real. La auditoría histórica en producción sigue pendiente antes del despliegue de H5.

Tests existentes: `npm.cmd test`. Build: `npm.cmd run build`.
