# Auditoría de dependencias de la demo Safari

Resultado de `npm audit --json`: **24 paquetes afectados: 13 altos, 11 moderados, 0 críticos**. Los avisos incluyen dependencias afectadas por otras dependencias; no equivalen a 24 fallos independientes. Informe original: [npm-audit.json](npm-audit.json). No se ejecutó `npm audit fix`, ni se instalaron o actualizaron paquetes.

La columna de ámbito se deriva de `packages[nodo].dev` del lockfile, no de una suposición sobre el nombre del paquete. **20 paquetes son exclusivamente de desarrollo y 4 tienen nodos clasificados como aplicación**. La clasificación aplicación corresponde al proyecto web completo: no implica inclusión en Safari.

| Paquete | Versión instalada | Severidad | Ámbito del lockfile | Motivo / aviso | En bundle Safari |
|---|---|---|---|---|---|
| `@capacitor/cli` | 8.5.3 | moderate | Desarrollo | xcode | No |
| `@firebase/firestore` | 4.16.0 | high | Aplicación | @grpc/grpc-js | No |
| `@firebase/firestore-compat` | 0.4.11 | high | Aplicación | @firebase/firestore | No |
| `@firebase/rules-unit-testing` | 5.0.2 | high | Desarrollo | firebase | No |
| `@google-cloud/pubsub` | 5.3.1 | moderate | Desarrollo | @opentelemetry/core | No |
| `@grpc/grpc-js` | 1.9.16 | high | Aplicación | [@grpc/grpc-js: In certain configurations, getAuthContext can return unauthorized certificates as though they were authorized](https://github.com/advisories/GHSA-m9gg-hp2v-232j), [@grpc/grpc-js: The server transmits some error messages thrown by method handlers to the client in status messages](https://github.com/advisories/GHSA-f596-whhp-79r4) | No |
| `@modelcontextprotocol/sdk` | 1.30.0 | high | Desarrollo | [MCP TypeScript SDK: OAuth client could send credentials to an authorization server chosen by the MCP server](https://github.com/advisories/GHSA-6qxp-vccf-f47h) | No |
| `@opentelemetry/core` | 1.30.1 | moderate | Desarrollo | [OpenTelemetry Core: Unbounded memory allocation in W3C Baggage propagation](https://github.com/advisories/GHSA-8988-4f7v-96qf) | No |
| `basic-ftp` | 5.3.1 | high | Desarrollo | [basic-ftp: Quadratic-time CPU denial of service in Client.list() Unix directory-listing parser (RE_LINE backtracking)](https://github.com/advisories/GHSA-c475-qrg2-pj4r) | No |
| `braces` | 3.0.3 | high | Desarrollo | [braces vulnerable to stack-exhaustion denial of service through deeply nested patterns](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | No |
| `chokidar` | 3.6.0 | high | Desarrollo | braces | No |
| `csv-parse` | 5.6.0 | moderate | Desarrollo | [node-csv: Prototype replacement still reachable via columns path](https://github.com/advisories/GHSA-8cw4-87c7-c6xx) | No |
| `firebase` | 12.15.0 | high | Aplicación | @firebase/firestore, @firebase/firestore-compat | No |
| `firebase-tools` | 15.30.2 | high | Desarrollo | @google-cloud/pubsub, @modelcontextprotocol/sdk, chokidar, csv-parse, gaxios, google-auth-library, proxy-agent, stream-json | No |
| `gaxios` | 6.7.1 | moderate | Desarrollo | uuid | No |
| `gcp-metadata` | 6.1.1 | moderate | Desarrollo | gaxios | No |
| `get-uri` | 6.0.5 | high | Desarrollo | basic-ftp | No |
| `google-auth-library` | 9.15.1 | moderate | Desarrollo | gaxios, gcp-metadata, gtoken | No |
| `gtoken` | 7.1.0 | moderate | Desarrollo | gaxios | No |
| `pac-proxy-agent` | 7.2.0 | high | Desarrollo | get-uri | No |
| `proxy-agent` | 6.5.0 | high | Desarrollo | pac-proxy-agent | No |
| `stream-json` | 1.9.1 | moderate | Desarrollo | [stream-json: pick/ignore/filter/replace filters are O(depth²) on nested input — small crafted JSON blocks the event loop for seconds→minutes (DoS)](https://github.com/advisories/GHSA-528h-pc64-c93x), [stream-json: JSONC parser and verifier re-scan the whole accumulated comment on every input chunk](https://github.com/advisories/GHSA-hqr4-qq8f-hg3x), [stream-json has a prototype pollution issue: Assembler writes this.current[this.key] on plain objects](https://github.com/advisories/GHSA-mjw6-4jj6-33hc) | No |
| `uuid` | 7.0.3, 9.0.1 | moderate | Desarrollo | [uuid: Missing buffer bounds check in v3/v5/v6 when buf is provided](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | No |
| `xcode` | 3.0.1 | moderate | Desarrollo | uuid | No |

## Comprobación de exclusión

`vite.config.mjs` rechaza Firebase y SDKs nativos. `reviewed-modules.json` registra los módulos emitidos en los chunks, no sólo las dependencias declaradas. `prepare.mjs` compara cada nodo vulnerable de `npm audit` con esos módulos y falla si existe una coincidencia. El resultado final es **0 paquetes vulnerables incluidos** según esta auditoría. Los hashes de las fuentes, lockfile y archivos entregables permiten comprobar exactamente qué se revisó.

Esta conclusión se limita a los avisos conocidos por npm y al build revisado. No certifica ausencia de vulnerabilidades desconocidas, scripts maliciosos o problemas del proveedor de hosting. Los avisos del proyecto completo siguen pendientes: revisar por separado actualizaciones dirigidas de Firebase/gRPC, Firebase CLI y Capacitor CLI y sus transitivas, con pruebas correspondientes. No se modifica PR #4, reglas ni dependencias para corregirlos en esta tarea.
