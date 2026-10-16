"""Single-panel functional, responsive, keyboard/AX and security checks."""
from pathlib import Path
import json,subprocess,time,urllib.request
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'.tools/mobile-integration-checks';OUT.mkdir(exist_ok=True)
URL='http://127.0.0.1:5197/'
server=subprocess.Popen(['node','node_modules/vite/bin/vite.js','preview','--config','mobile/integration-final/vite.config.mjs','--port','5197','--strictPort'],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
checks=0

def check(ok,msg):
 global checks
 assert ok,msg
 checks+=1
try:
 for _ in range(100):
  try:urllib.request.urlopen(URL);break
  except OSError:time.sleep(.05)
 with sync_playwright() as p:
  b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-background-networking'])
  ctx=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,reduced_motion='reduce')
  page=ctx.new_page();errors=[];requests=[];events=[]
  page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url));page.on('download',lambda _:events.append('download'));page.on('popup',lambda _:events.append('popup'))
  def tab(label):page.locator('.bottom-nav button').filter(has_text=label).click();page.wait_for_timeout(100)
  def search(value):page.get_by_role('searchbox',name='Buscar materia').fill(value)
  def open_first():page.locator('.subject-result-row').first.click();page.locator('.subject-detail-panel').wait_for();page.wait_for_timeout(80)
  def close():page.get_by_role('button',name='Cerrar',exact=True).click();page.locator('.subject-detail-panel').wait_for(state='hidden');page.wait_for_timeout(100)
  def select(id):
   page.get_by_role('button',name='Cambiar contexto académico').click();page.locator(f'.career-tile[data-catalog="{id}"]').get_by_role('button',name='Seleccionar',exact=True).click();page.wait_for_timeout(100);tab('Materias')
  def audit():
   cdp=ctx.new_cdp_session(page);nodes=cdp.send('Accessibility.getFullAXTree')['nodes'];cdp.detach()
   controls=[n for n in nodes if not n.get('ignored') and n.get('role',{}).get('value') in ['button','group','dialog']]
   check(all(n.get('name',{}).get('value','').strip() for n in controls),'AX controls and dialog named '+str([(n.get('role'),n.get('name')) for n in controls if not n.get('name',{}).get('value','').strip()]))
   check(page.locator('[role=dialog]').count()==1,'exactly one dialog')
   check(page.locator('.subject-modal,.subject-detail-button').count()==0,'old nested detail absent')
   panel=page.locator('.subject-detail-panel')
   check(panel.evaluate('(e)=>e.scrollWidth<=e.clientWidth+1'),'no panel horizontal overflow')
   for el in panel.locator('button,summary').all():
    if el.is_visible():
     box=el.bounding_box();check(box['width']>=43.5 and box['height']>=43.5,'44px panel touch target')
  page.goto(URL);tab('Materias');search('algebra');open_first()
  check(page.locator('#subject-detail-title').inner_text()=='Álgebra y Geometría Analítica','live subject identity')
  check('UTN-ISI23-02' in page.locator('.detail-code').inner_text(),'code present')
  check('1° Año' in page.locator('.detail-code').inner_text() and 'Anual' in page.locator('.detail-code').inner_text(),'level and period present')
  check('Plan 2023' in page.locator('#subject-detail-context').inner_text(),'academic context identified')
  check(page.locator('.status-actions button').all_text_contents()==['Pendiente','Cursando','Regularizada','Aprobada'],'four state options')
  check('horas cátedra semanales' in page.locator('.detail-hours').inner_text(),'actual hour unit preserved')
  check(page.get_by_text('El catálogo no incluye una descripción.',exact=True).is_visible(),'missing description is explicit')
  check(page.locator('[aria-label="Requisitos de cursada"]').get_by_role('heading',name='Tener regularizadas o aprobadas').count()==1,'regularization separated')
  check(page.locator('[aria-label="Requisitos de cursada"]').get_by_role('heading',name='Tener aprobadas').count()==1,'approval separated')
  check('no garantiza' in page.locator('[aria-label="Dependencias directas"]').inner_text(),'dependencies are not guaranteed habilitations')
  length=page.evaluate('history.length');page.get_by_role('button',name='Ampliar panel').click();audit()
  check(page.evaluate('history.length')==length,'expansion does not add history entry')
  check(page.locator('.subject-detail-panel').evaluate('(e)=>Math.abs(e.getBoundingClientRect().height-visualViewport.height)<2'),'expanded panel fills visual viewport')
  page.get_by_role('button',name='Reducir panel').click();check(page.locator('[role=dialog]').count()==1,'reduce remains one panel')
  page.keyboard.press('Escape');page.locator('.subject-detail-panel').wait_for(state='hidden');check(page.get_by_role('searchbox').input_value()=='algebra','Escape preserves query')
  open_first();page.go_back();page.locator('.subject-detail-panel').wait_for(state='hidden');check(page.get_by_role('searchbox').input_value()=='algebra','one Back closes detail')
  page.go_forward();page.locator('.subject-detail-panel').wait_for();check(page.locator('#subject-detail-title').inner_text()=='Álgebra y Geometría Analítica','Forward reopens same live subject')
  # Map action must select the exact subject without changing academic context.
  page.get_by_role('button',name='Ver en el mapa',exact=True).click();page.wait_for_url(URL+'#mapa')
  check('Álgebra y Geometría Analítica' in page.locator('.map-subject.selected').inner_text(),'map selects correct subject')
  check('Sistemas' in page.locator('.context-selector').inner_text(),'map context unchanged')
  page.go_back();page.locator('.subject-detail-panel').wait_for();check(page.get_by_role('heading',name='Álgebra y Geometría Analítica',exact=True).is_visible(),'Back from map returns to detail')
  close();check(page.get_by_role('searchbox').input_value()=='algebra','map round trip preserves query')
  # Real catalog description is rendered only where present.
  select('utn-industrial-2023');search('electivas');open_first()
  check('Asignaturas electivas hasta completar' in page.locator('[aria-label="Información del catálogo"]').inner_text(),'existing description shown verbatim')
  close();select('utn-sistemas-2023');search('UTN-ISI23-01');open_first()
  # Changing the recorded state is not a final permission check.
  page.locator('.status-actions button').filter(has_text='Cursando').click();page.locator('[data-academic-phase=success]').last.wait_for()
  check('Todavía no está regularizada' in page.locator('[aria-label="Habilitaciones académicas"]').inner_text(),'final status checks own regularization')
  check(page.locator('.status-actions [aria-pressed=true]').inner_text()=='Cursando','pressed state reflects confirmed record')
  close();tab('Inicio');check(page.locator('.overview-card strong').first.inner_text()=='12','dashboard updates from shared record')
  tab('Materias');check(page.get_by_role('searchbox').input_value()=='UTN-ISI23-01','state change preserves search')
  check(page.locator('.subject-result-row .demo-status').inner_text()=='Cursando','list updates from same record')
  # Responsive detail, fullscreen, focus containment and short visual viewport.
  for width,height in [(320,568),(375,667),(390,844),(430,932),(844,390),(1280,800),(320,340)]:
   page.set_viewport_size({'width':width,'height':height});open_first();audit()
   check(page.locator('.subject-detail-panel').evaluate('(e)=>e.getBoundingClientRect().bottom<=visualViewport.height+visualViewport.offsetTop+1'),'panel stays inside viewport')
   page.get_by_role('button',name='Ampliar panel').click();audit()
   page.get_by_role('button',name='Cerrar',exact=True).focus()
   for _ in range(10):
    page.keyboard.press('Tab');check(page.evaluate("Boolean(document.activeElement.closest('[role=dialog]'))"),'focus trapped within the one dialog')
   page.get_by_role('button',name='Ver en el mapa',exact=True).scroll_into_view_if_needed()
   check(page.get_by_role('button',name='Ver en el mapa',exact=True).is_visible(),'map action reachable at small heights')
   page.get_by_role('button',name='Cerrar',exact=True).click();page.locator('.subject-detail-panel').wait_for(state='hidden')
  page.set_viewport_size({'width':390,'height':844});open_first();page.screenshot(path=str(OUT/'detail-390.png'))
  page.get_by_role('button',name='Ampliar panel').click();page.screenshot(path=str(OUT/'detail-full-390.png'))
  page.evaluate("document.documentElement.style.fontSize='200%'");audit();page.evaluate("document.documentElement.style.fontSize=''")
  # Contrast of text introduced in the panel (not a full WCAG certification).
  contrast=page.evaluate("""()=>{const rgb=s=>s.match(/[\\d.]+/g).map(Number);const lum=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);return [...document.querySelectorAll('.detail-identity h3,.detail-identity p,.detail-identity .status,.detail-section h3,.detail-section h4,.detail-section p,.detail-section li strong,.detail-section li small,.detail-status-editor legend,.detail-status-editor button:not(:disabled)')].map(e=>{const fg=rgb(getComputedStyle(e).color);let bg=[255,255,255],node=e;while(node){const c=rgb(getComputedStyle(node).backgroundColor);if(c.length===3||c[3]===1){bg=c;break}node=node.parentElement}const l=[lum(fg),lum(bg)].sort((a,b)=>b-a);return{text:e.textContent.slice(0,60),ratio:(l[0]+.05)/(l[1]+.05)}})}""")
  check(all(x['ratio']>=4.5 for x in contrast),'new panel text contrast at least 4.5:1 '+str(contrast))
  close();ctx.set_offline(True);open_first();page.locator('.status-actions button').filter(has_text='Regularizada').click();page.locator('[data-academic-phase=success]').last.wait_for();check(page.locator('.detail-identity .status').inner_text()=='Regularizada','detail update works offline after loading');ctx.set_offline(False)
  check(not errors,'no JS errors '+str(errors));check(not events,'no popups or downloads')
  check(all(r.startswith(URL) or r.startswith('data:') for r in requests),'no external requests')
  check(not page.locator('input#grade,iframe,link[rel=manifest],a[download]').count(),'no grade integration/install mechanisms')
  check(page.evaluate("sessionStorage.length===0 && Object.keys(localStorage).every(k=>k==='correlativas-demo-235-academic-v1')"),'only namespaced demo storage')
  result={'checks':checks,'errors':errors,'externalRequests':[],'unexpectedEvents':events,'automatedAccessibility':'AX names, single dialog, keyboard focus containment, 44px controls, 200% root text, text contrast; not axe/full WCAG audit','minimumTextContrast':min(x['ratio'] for x in contrast),'physicalSafariTested':False}
  (OUT/'detail.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2));b.close()
finally:server.terminate();server.wait(timeout=10)
