# Mobile 2.4.0 — Base reproducible

Base aprobada: ZIP de Mobile 2.3.6 con las correcciones finales de Inicio y las cinco secciones. SHA-256 `c1cc05d626c911976dcdca0e4fdf4bff22c0c95339a1b2450ce36942781e587a`, entregado en el commit `9c420fcfc5a5cd57196517b1a65e501c2c407f33`.

Esta entrega prepara fuentes y herramientas locales; no integra servicios, cambia UI ni avanza a 2.4.1. No se han creado commits ni publicaciones. Requiere autorización específica antes de versionar/publicar.

## Archivos y trazabilidad

`inputs.lock.json` fija SHA-256 de cada entrada requerida (componentes, estilos, dependencias compartidas, configuraciones, tests y package/lockfile). Los archivos de aplicación permanecen byte por byte iguales a la base aprobada. El manifiesto histórico local de 66 archivos se verificó completo; ese manifiesto por sí solo no incluía todas las importaciones compartidas. Se añadió la cadena transitiva, no una copia de la aplicación ni de node_modules.

El ZIP de referencia y su checksum ya están versionados en `mobile/integration-final/downloads/`; el verificador los compara con el hash aprobado, nunca los sobrescribe. Las fuentes mobile nuevas propuestas están enumeradas en `files-to-version.txt`. Dependencias compartidas ya versionadas siguen en sus rutas; no se duplican componentes ni se cambian imports.

Se excluyen de esta base las documentaciones/reportes históricos de `mobile/integration-final`, el empaquetador antiguo `prepare.py` (apuntaba a un ZIP anterior), el test comparativo `integration.check.py` que requiere otra demo histórica y los harnesses privados no necesarios para las regresiones seleccionadas. No se eliminan esos archivos locales. El comando oficial de reconstrucción de esta entrega es `rebuild.py`.

## Herramientas exactas verificadas

Consultar `toolchain.json`: Linux x86_64, Node 24.19.0, npm 11.9.0, Python 3.12.14 y zlib 1.3.2. Para las pruebas de navegador: Playwright Python 1.62.0 y Chromium 154.0.8037.57 en `/usr/bin/chromium`. Las regresiones no requieren construir apps nativas ni emuladores Firebase.

No se actualizaron package.json/package-lock.json ni paquetes. La instalación congelada usa el lockfile existente. Para reproducir los bytes comprimidos del ZIP también importan Python/zlib, no sólo Vite. El verificador rechaza una toolchain distinta en lugar de sustituir el hash aprobado. No se certifican otras plataformas, versiones de navegador o sistema operativo.

## Desde un checkout que contenga los archivos aprobados para versionar

Ejecutar desde la raíz del repositorio, con las versiones anteriores activas:

```sh
npm ci --ignore-scripts --no-audit --no-fund --cache /tmp/correlativas-npm-cache
python3 mobile/reproducible-base/rebuild.py --verify-only
python3 mobile/reproducible-base/rebuild.py
python3 mobile/reproducible-base/regression.py --suite models
```

`npm ci` descarga paquetes si no están en la caché; no inicia Firebase ni conecta la demo a servidores. `--ignore-scripts` evita ejecutar scripts de instalación. La instalación de los paquetes ya declarados en el repositorio no implica que Firebase forme parte del bundle: el build lo prohíbe y verifica los módulos incluidos. No se solicita ninguna credencial de producción.

Para las regresiones de navegador, preparar Playwright de `requirements-tests.txt` en un entorno Python y un Chromium compatible en la ruta documentada. Después:

```sh
python3 mobile/reproducible-base/regression.py --suite browser
```

La suite conserva las pruebas originales, cambia sólo la ruta del preview en memoria para utilizar la distribución reproducida y ejecuta tres procesos como máximo en paralelo. No modifica los tests de la UI. Los reportes quedan en `.tools/mobile-240-regression/`.

## Prueba de independencia del workspace

El exportador copia únicamente las entradas declaradas, el ZIP de referencia y estas herramientas. No copia .git, .env, credenciales, otros archivos locales, builds, node_modules ni cachés. Elegir un destino nuevo, fuera del checkout:

```sh
python3 mobile/reproducible-base/export_clean.py /tmp/correlativas-mobile-240-clean
cd /tmp/correlativas-mobile-240-clean
npm ci --ignore-scripts --no-audit --no-fund --cache /tmp/correlativas-npm-cache
python3 mobile/reproducible-base/rebuild.py
python3 mobile/reproducible-base/regression.py
```

Una caché npm acelera la instalación, pero no contiene fuentes de la demo ni reemplaza el lockfile. Puede instalarse con acceso al registro en otro entorno; se conserva la verificación de integridad y TLS. El exportador es una prueba de cierre del conjunto de archivos, no una creación de rama ni worktree.

## Resultado esperado y seguridad

El reconstruido se escribe sólo en `.tools/mobile-240-reproduction/`, separado de todos los ZIP y dist anteriores. Deben coincidir **los seis archivos estáticos y el ZIP completo byte por byte** con la referencia. Se preservan orden de entradas ZIP, fecha fija de la referencia, permisos y compresión. SHA256SUMS excluye su propio contenido, como en la entrega aprobada.

El build conserva seis pestañas, fixtures, persistencia ficticia y CSP. No publica nada. Verifica fuentes declaradas, whitelist, hashes, módulos backend/native excluidos y patrones de credenciales. La prueba histórica de CSP en Safari informada por el usuario sigue siendo evidencia manual; las regresiones actuales de Chromium no reemplazan Safari físico, VoiceOver ni una auditoría completa de seguridad.

Los controles de red de la demo siguen intactos. Sólo la instalación de dependencias puede necesitar el registro npm. No se modifican Firebase, Rules, Vercel, Cloudflare ni producción. No se guardan procesos de preview permanentes.

`verification.json` registra los resultados de esta entrega. Los artefactos reconstruidos, logs, cachés y node_modules no se proponen para el commit. No avanzar a 2.4.1 sin autorización.

## Resultado verificado de Mobile 2.4.0

- 66/66 entradas del manifiesto histórico coinciden con las fuentes locales aprobadas.
- Cierre explícito de **75 entradas**: 46 fuentes/tests/config de demo nuevos propuestos y 29 archivos compartidos ya versionados.
- Propuesta de **55 archivos nuevos**: los 46 anteriores más 9 archivos de herramientas/documentación/evidencia. La lista completa está en `files-to-version.txt`; no usar un agregado indiscriminado del workspace.
- Exportación limpia de **85 archivos**, sin .git, .env, node_modules ni builds. El informe de evidencia no es requisito de compilación y no se copia al export mínimo.
- Instalación limpia de **858 paquetes del lockfile existente**, con npm ci offline e ignore-scripts; no se actualizó ninguna versión. La caché npm aportó los paquetes, no fuentes locales ni módulos instalados del workspace.
- Build en el checkout y en la carpeta limpia: **los seis archivos y el ZIP completo coinciden byte por byte**. Repetición del build limpio también idéntica.
- El grafo de módulos se verifica dentro de la raíz limpia, incluidas sus dependencias; ninguna dependencia se toma de node_modules del workspace original. Mismas 24 familias de paquetes del bundle, sin Firebase ni Capacitor.
- **57 pruebas de modelo aprobadas**, cero fallidas u omitidas; **2.887 comprobaciones de navegador** en las ocho suites aprobadas. Sin errores JS ni solicitudes externas observadas.
- Pruebas negativas: una fuente alterada y una fuente faltante se rechazan antes del build; se restauró inmediatamente la copia de prueba.
- La instalación emitió avisos históricos de deprecación (node-domexception, json-ptr, uuid y glob). No se hicieron actualizaciones ni npm audit; no se afirma ausencia de vulnerabilidades.

La verificación se ejecutó en otra carpeta con instalación fresca **en la misma máquina Linux y con la toolchain documentada**. No se afirma haber probado otra máquina, otro SO ni instalación sin caché accediendo al registro npm. La preparación ya no requiere archivos no declarados del workspace, pero todavía no puede clonarse desde GitHub hasta que se autorice y publique el conjunto de fuentes propuesto.

## Entradas compartidas ya versionadas

Estas entradas del manifiesto no son cambios nuevos ni se deben duplicar:

- `mobile/safari-demo-site/_headers`
- `mobile/stage2-navigation/NavigationPages.jsx`
- `mobile/stage2-navigation/navigation.css`
- `mobile/stage2-navigation/vite.config.mjs`
- `package-lock.json`
- `package.json`
- `prototypes/mobile-app/MobileMap.jsx`
- `prototypes/mobile-app/data.js`
- `prototypes/mobile-app/mobile.css`
- `prototypes/mobile-app/smoke.mjs`
- `prototypes/mobile-app/vite.config.mjs`
- `public/logo.png`
- `src/academicOnboardingLogic.js`
- `src/careerInstanceLogic.js`
- `src/components/CareerMap.jsx`
- `src/components/CareerSelector.jsx`
- `src/components/ProgressSummary.jsx`
- `src/data/careers.js`
- `src/data/uade/industrial.js`
- `src/data/uade/informatica.js`
- `src/data/uba/actuario.js`
- `src/data/uba/odontologia.js`
- `src/data/uca/teologiaSistematica.js`
- `src/data/utn/industrial2007.js`
- `src/data/utn/industrial2023.js`
- `src/data/utn/sistemas2023.js`
- `src/logic.js`
- `src/styles.css`
- `src/userDataAuthorityLogic.js`
