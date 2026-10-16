// Run the frozen visual-demo regressions with explicit adaptations for approved
// removal of grade/average UI and asynchronous local status changes.
import fs from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
const root=fileURLToPath(new URL('../..',import.meta.url))
let suite=await fs.readFile(`${root}/prototypes/mobile-app/smoke.mjs`,'utf8')
suite=suite.replace("const root = fileURLToPath(new URL('../..', import.meta.url))",`const root = ${JSON.stringify(root)}`)
suite=suite.replace("document.querySelectorAll('.bottom-nav button').length === 4","document.querySelectorAll('.bottom-nav button').length === 6")
suite=suite.replaceAll("document.querySelector('.overview-grid').textContent.includes('8,38')","document.querySelectorAll('.overview-card').length === 4 && !document.querySelector('#grade')")
suite=suite.replaceAll("document.querySelector('.overview-grid')?.textContent.includes('8,38')","document.querySelectorAll('.overview-card').length === 4 && !document.querySelector('#grade')")
// The redesigned quick row now contains states only; finals live in advanced filters.
suite=suite.replace('i < 5; i++','i < 4; i++')
suite=suite.replace("document.activeElement.textContent === 'Finales'", "document.activeElement.textContent === 'Pendientes'")
suite=suite.replace("document.querySelector('.filter-scroller button[aria-pressed=\"true\"]')?.textContent === 'Finales'", "Boolean(document.querySelector('[aria-label=\"Quitar filtro Finales habilitados\"]'))")
let start=suite.indexOf("  await wait(`Boolean(document.querySelector('#grade'))`)")
let end=suite.indexOf("  await click('.subject-detail-button')",start)
assert.ok(start>0 && end>start)
suite=suite.slice(0,start)+`  await wait(\`!document.querySelector('#grade')\`)
  await textClick('.status-actions button', 'Cursando')
  await wait(\`document.querySelector('.demo-sheet .status').textContent === 'Cursando'\`)
  await textClick('.status-actions button', 'Aprobada')
  await wait(\`document.querySelector('.demo-sheet .status').textContent === 'Aprobada'\`)
`+suite.slice(end)
start=suite.indexOf("  await wait(`Boolean(document.querySelector('#grade'))`)")
end=suite.indexOf("  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844",start)
assert.ok(start>0 && end>start)
suite=suite.slice(0,start)+`  await wait(\`!document.querySelector('#grade')\`)
  await call('Emulation.setDeviceMetricsOverride', { width: 320, height: 340, deviceScaleFactor: 1, mobile: true })
  await wait(\`(()=>{const r=document.querySelector('.demo-sheet').getBoundingClientRect(),v=visualViewport;return r.bottom<=v.height+v.offsetTop+1 && r.top>=v.offsetTop-1})()\`, 'sheet remains inside short viewport')
  await evaluate(\`document.querySelector('.demo-sheet header button').focus()\`)
  await wait(\`document.activeElement.getAttribute('aria-label') === 'Cerrar'\`, 'close control is keyboard accessible')
  await shot('edicion-320-short-viewport')
  await close()
`+suite.slice(end)
for (const status of ['Pendiente','Aprobada']) {
 const old = `await textClick('.status-actions button', '${status}')\n  await close()`
 const updated = `await textClick('.status-actions button', '${status}')\n  await wait(\`document.querySelector('.demo-sheet .status').textContent === '${status}'\`)\n  await close()`
 assert.ok(suite.includes(old), 'review map async adaptation')
 suite=suite.replace(old,updated)
}
const oldDetail = `  await click('.subject-detail-button')
  await wait(\`Boolean(document.querySelector('.subject-modal'))\`)
  await click('button[aria-label="Cerrar detalle de materia"]')
  await wait(\`!document.querySelector('.subject-modal')\`)`
assert.ok(suite.includes(oldDetail),'review single-panel regression adaptation')
suite=suite.replace(oldDetail,`  await click('button[aria-label="Ampliar panel"]')
  await wait(\`document.querySelectorAll('[role="dialog"]').length === 1 && document.querySelector('.subject-detail-panel').classList.contains('is-full')\`)
  await click('button[aria-label="Reducir panel"]')
  await wait(\`!document.querySelector('.subject-modal') && Boolean(document.querySelector('.subject-detail-panel'))\`)`)
suite=suite.replace("document.querySelector('.demo-sheet header button').focus()", "document.querySelector('.demo-sheet button[aria-label=\"Cerrar\"]').focus()")
assert.equal(suite.split("await call('Page.reload')").length,2)
suite=suite.replace("await call('Page.reload')","await nav('Inicio')\n  await call('Page.reload')")
suite=suite.replaceAll("'.demo-sheet header button'", '\'.demo-sheet button[aria-label="Cerrar"]\'')
suite=suite.replace('grade/status, map/planner','status (grade UI intentionally removed), map/planner')
const child=spawn(process.execPath,['--input-type=module','--eval',suite],{cwd:root,stdio:'inherit',env:{...process.env,DEMO_VITE_CONFIG:'mobile/integration-final/vite.config.mjs'}})
child.on('exit',async code=>{
 process.exitCode=code??1
 if(code===0){await fs.mkdir(`${root}/.tools/mobile-integration-checks`,{recursive:true});await fs.copyFile(`${root}/.tools/mobile-demo-artifacts/result.json`,`${root}/.tools/mobile-integration-checks/regression.json`)}
})
