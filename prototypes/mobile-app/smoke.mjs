// Real Chromium checks, using Node's built-in WebSocket. No extra dependencies.
// Run after the demo build: node prototypes/mobile-app/smoke.mjs
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
const root = fileURLToPath(new URL('../..', import.meta.url))
const portable = process.argv.includes('--portable')
const pageURL = portable ? 'http://127.0.0.1:5182/Correlativas-demo.html' : 'http://127.0.0.1:5182/'
const artifacts = path.join(root, '.tools/mobile-demo-artifacts')
await fs.mkdir(artifacts, { recursive: true })
const preview = portable
  ? spawn('python', ['-m', 'http.server', '5182', '--bind', '127.0.0.1', '--directory', path.join(root, '.tools/mobile-demo-portable')], { stdio: 'ignore' })
  : spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--config', 'prototypes/mobile-app/vite.config.mjs', '--port', '5182'], { cwd: root, stdio: 'ignore' })
const browser = spawn(process.env.CHROMIUM_BIN || 'chromium', ['--headless', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=9223', `--user-data-dir=${path.join(artifacts, 'browser-profile')}`, 'about:blank'], { stdio: 'ignore' })
let ws, count = 0
const delay = ms => new Promise(r => setTimeout(r, ms))
const errors = [], requests = []
try {
  let targets
  for (let n = 0; n < 80; n++) { try { targets = await (await fetch('http://127.0.0.1:9223/json')).json(); await fetch('http://127.0.0.1:5182/'); break } catch { await delay(100) } }
  assert.ok(targets, 'Chromium and preview must start')
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }) })
  let id = 0; const pending = new Map()
  ws.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data)
    if (message.id) { const p = pending.get(message.id); pending.delete(message.id); message.error ? p.reject(message.error) : p.resolve(message.result) }
    else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text)
    else if (message.method === 'Network.requestWillBeSent') requests.push(message.params.request.url)
  })
  const call = (method, params = {}) => new Promise((resolve, reject) => { const key = ++id; pending.set(key, { resolve, reject }); ws.send(JSON.stringify({ id: key, method, params })) })
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description)
    return result.result.value
  }
  const wait = async (expression, label = expression) => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) { count++; return } await delay(40) } throw Error(`Timed out: ${label}`) }
  const click = async selector => { assert.ok(await evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`), selector); await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); await delay(90) }
  const textClick = async (selector, text) => { assert.ok(await evaluate(`Boolean([...document.querySelectorAll(${JSON.stringify(selector)})].find(e => e.textContent.trim() === ${JSON.stringify(text)}))`), `button ${text}`); await evaluate(`[...document.querySelectorAll(${JSON.stringify(selector)})].find(e => e.textContent.trim() === ${JSON.stringify(text)}).click()`); await delay(90) }
  const fill = async (selector, value) => { await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`); await delay(90) }
  const nav = async label => { await textClick('.bottom-nav button', label); await wait(`!document.querySelector('.demo-sheet')`) }
  const close = async () => { await click('.demo-sheet header button'); await wait(`!document.querySelector('.demo-sheet')`) }
  const shot = async name => { await fs.writeFile(path.join(artifacts, `${portable ? 'portable-' : ''}${name}.png`), Buffer.from((await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })).data, 'base64')) }
  await call('Runtime.enable'); await call('Network.enable'); await call('Page.enable')
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await call('Page.navigate', { url: pageURL })
  await wait(`Boolean(document.querySelector('.journey-card'))`)
  await wait(`document.querySelectorAll('.bottom-nav button').length === 4`)
  await wait(`document.querySelector('.overview-grid').textContent.includes('8,38')`)
  await shot('inicio-390')
  await nav('Materias')
  await fill('input[aria-label="Buscar materia"]', 'algebra')
  await wait(`document.querySelectorAll('.demo-subject-row').length === 1`)
  await click('.demo-subject-row')
  await wait(`Boolean(document.querySelector('#grade'))`)
  await fill('#grade', '10')
  await click('.grade-form button[type="submit"]')
  await wait(`!document.querySelector('.demo-sheet')`)
  await nav('Inicio')
  await wait(`document.querySelector('.overview-grid').textContent.includes('8,46')`)
  await click('.overview-card:last-child')
  await wait(`document.querySelectorAll('.grade-line').length === 13`)
  await close()
  await nav('Materias')
  await click('.demo-subject-row')
  await textClick('.status-actions button', 'Pendiente')
  await wait(`!document.querySelector('#grade')`)
  await textClick('.status-actions button', 'Aprobada')
  await wait(`Boolean(document.querySelector('#grade'))`)
  await fill('#grade', '')
  await click('.grade-form button[type="submit"]')
  await wait(`!document.querySelector('.demo-sheet')`)
  await wait(`document.querySelector('.demo-subject-row').textContent.includes('Sin nota')`)
  await click('.demo-subject-row')
  await click('.subject-detail-button')
  await wait(`Boolean(document.querySelector('.subject-modal'))`)
  await click('button[aria-label="Cerrar detalle de materia"]')
  await wait(`!document.querySelector('.subject-modal')`)
  await close()
  await fill('input[aria-label="Buscar materia"]', 'xxxxxxxx')
  await wait(`Boolean(document.querySelector('.empty-state'))`)
  await textClick('.empty-state button', 'Ver todas')
  await wait(`document.querySelectorAll('.demo-subject-row').length === 44`)
  await shot('materias-390')
  await nav('Mapa')
  await wait(`document.querySelectorAll('.year-column').length === 5`)
  await evaluate(`[...document.querySelectorAll('.map-subject')].find(e=>e.textContent.includes('Física II')).click()`)
  await wait(`Boolean(document.querySelector('.map-subject.selected'))`)
  await wait(`document.querySelectorAll('.map-subject.related').length > 0`)
  await shot('mapa-390')
  await click('.map-to-planner-btn')
  await wait(`document.querySelector('main').textContent.includes('Mi selección') && document.querySelectorAll('.selection-item').length === 1`)
  await textClick('.selection-item button', 'Quitar de mi selección')
  await wait(`document.querySelectorAll('.selection-item').length === 0`)
  await nav('Comunidad')
  await wait(`document.querySelectorAll('button.friend-card').length === 3`)
  await click('button[aria-label="Agregar amistad"]')
  await textClick('.demo-sheet button', 'Simular solicitud de amistad')
  await wait(`Boolean(document.querySelector('.demo-sheet .primary-btn:disabled'))`)
  await close()
  await textClick('.segmented button', 'Grupos')
  await click('.group-card')
  await textClick('.demo-sheet button', 'Sumarme al grupo de ejemplo')
  await wait(`Boolean(document.querySelector('.demo-sheet .primary-btn:disabled'))`)
  await close()
  await wait(`document.querySelector('.group-card').textContent.includes('Te sumaste')`)
  await shot('comunidad-390')
  await click('.notification-button')
  await wait(`document.querySelectorAll('.notification-item').length === 3`)
  await textClick('.notification-tools button', 'Marcar todas leídas')
  await wait(`document.querySelector('.notification-tools').textContent.includes('0 sin leer')`)
  await shot('notificaciones-390')
  await close()
  await wait(`!document.querySelector('.notification-dot')`)
  await click('.notification-button')
  await click('.notification-item')
  await wait(`document.querySelector('.group-title')?.textContent.includes('Bases de Datos')`)
  await close()
  await click('button[aria-label="Reiniciar demo"]')
  await textClick('.demo-sheet button', 'Sí, reiniciar demo')
  await wait(`document.querySelector('.overview-grid')?.textContent.includes('8,38')`)
  await wait(`Boolean(document.querySelector('.notification-dot'))`)
  // Every main screen at narrow, common, large mobile and desktop sizes.
  for (const width of [320, 390, 430, 1280]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: width === 1280 ? 1000 : 844, deviceScaleFactor: 1, mobile: width < 850 })
    for (const label of ['Inicio', 'Materias', 'Mapa', 'Comunidad']) {
      await nav(label)
      await wait(`document.documentElement.scrollWidth <= innerWidth`, `no page overflow: ${label} ${width}`)
      const layout = await evaluate(`(()=>{const n=document.querySelector('.bottom-nav').getBoundingClientRect();return {width:innerWidth,navWidth:n.width,buttons:[...document.querySelectorAll('.bottom-nav button')].map(e=>{const r=e.getBoundingClientRect();return {width:r.width,height:r.height}})}})()`)
      assert.ok(layout.buttons.every(b => b.width >= 44 && b.height >= 44))
      if (width === 320 || width === 1280) await shot(`${label.toLowerCase()}-${width}`)
    }
  }
  await call('Page.reload')
  await wait(`document.querySelector('.overview-grid')?.textContent.includes('8,38')`)
  assert.deepEqual(errors, [], 'No uncaught JS errors')
  assert.deepEqual(requests.filter(url => !url.startsWith('http://127.0.0.1:5182/') && !url.startsWith('data:')), [], 'No external requests, including Firebase')
  const csp = await evaluate(`document.querySelector('meta[http-equiv="Content-Security-Policy"]').content`)
  assert.ok(csp.includes("connect-src 'none'"))
  console.log(`PASS (${portable ? 'portable HTML served locally' : 'preview'}): ${count} browser assertions; grade/status, map/planner, community, notifications, reset, 4 widths; zero external requests or JS errors.`)
  await fs.writeFile(path.join(artifacts, portable ? 'result-portable.json' : 'result.json'), JSON.stringify({ passed: true, assertions: count, widths: [320, 390, 430, 1280], javascriptErrors: errors, externalRequests: [], timestamp: new Date().toISOString() }, null, 2))
} finally {
  ws?.close(); browser.kill('SIGTERM'); preview.kill('SIGTERM')
}
