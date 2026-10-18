# Demo responsive aislada
Desde la raíz: `node node_modules/vite/bin/vite.js --config prototypes/responsive-navigation/vite.config.mjs`.
Abrir http://127.0.0.1:5186 en Chrome/Edge o Simple Browser de VS Code.
Probar 390×844 y 1440×900. Navegar por las seis secciones, modificar estados ficticios y cambiar tamaño sin recargar. Recargar reinicia los datos.
Reutiliza App y estilos aprobados Mobile 2.4.3. Un transform exclusivo de esta configuración elimina la lectura/escritura local de su hook antes de servirlo; no cambia las fuentes compartidas. El build rechaza imports productivos, SDKs Firebase/Capacitor y almacenamiento persistente en fuentes propias. CSP bloquea conexiones de la página.
Planificar conserva la selección exploratoria del mapa. Proyectar es una distribución visual ficticia sin motor de correlativas ni fechas. No acredita paridad completa desktop, persistencia, autenticación ni integración Mobile/Web. No requiere Emulator. Sin instalaciones ni despliegues.
Build opcional: `node node_modules/vite/bin/vite.js build --config prototypes/responsive-navigation/vite.config.mjs` (salida local dist, no versionar).
