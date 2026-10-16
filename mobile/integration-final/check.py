"""Local-only functional, accessibility, responsive and security checks."""
import json, re, subprocess, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'.tools/mobile-integration-checks'; OUT.mkdir(exist_ok=True)
URL='http://127.0.0.1:5191/'
server=subprocess.Popen(['node','node_modules/vite/bin/vite.js','preview','--config','mobile/integration-final/vite.config.mjs','--port','5191','--strictPort'],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
checks=0

def check(ok,message):
 global checks
 assert ok,message
 checks+=1

try:
 for _ in range(100):
  try: urllib.request.urlopen(URL);break
  except OSError: time.sleep(.05)
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-background-networking'])
  ctx=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,reduced_motion='reduce')
  page=ctx.new_page(); requests=[];errors=[];events=[]
  page.on('request',lambda r:requests.append(r.url));page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('download',lambda _:events.append('download'));page.on('popup',lambda _:events.append('popup'))
  page.on('response',lambda r:events.append('redirect') if 300<=r.status<400 else None)
  page.expose_binding('__sensitiveCall',lambda source,name:events.append(name))
  page.add_init_script("""const block=(o,k)=>{if(o&&typeof o[k]==='function')Object.defineProperty(o,k,{value:()=>{window.__sensitiveCall(k);throw Error('Sensitive API')}})};
  block(navigator.geolocation,'getCurrentPosition');block(navigator.geolocation,'watchPosition');block(navigator.mediaDevices,'getUserMedia');block(navigator.mediaDevices,'getDisplayMedia');block(window.Notification,'requestPermission');block(navigator.serviceWorker,'register');block(navigator.credentials,'get');block(navigator.credentials,'create');block(navigator.clipboard,'read');block(navigator.clipboard,'readText');""")
  headers=dict(line.strip().split(': ',1) for line in (ROOT/'mobile/safari-demo-site/_headers').read_text().splitlines() if line.startswith('  '))
  with urllib.request.urlopen(URL) as response:
   for k,v in headers.items():check(response.headers[k]==v,'header '+k)
  def route(name):
   page.wait_for_url(URL+'#'+name);page.wait_for_timeout(80)
   check(page.locator('main').is_visible(),'destination visible '+name)
  def careers():
   page.get_by_role('button',name='Cambiar contexto académico').click();route('carreras')
  def scenario(name):
   page.get_by_role('button',name='Abrir Cuenta de Alex, perfil ficticio').click();route('cuenta')
   page.locator('.context-scenarios summary').click()
   page.locator('#demo-scenario').select_option(name);page.wait_for_timeout(100)
   careers()
  def start():
   page.locator('.career-manager > button').click();route('alta-universidad')
   check(page.locator('.bottom-nav').count()==0,'tabs hidden during add')
  def uni(name):
   page.locator('.wizard-options button').filter(has_text=name).click();route('alta-carrera')
  def career(name):
   page.locator('.wizard-options button').filter(has_text=name).click();route('alta-plan')
  def back():page.get_by_role('button',name='Atrás',exact=True).click()
  def add():page.get_by_role('button',name='Agregar carrera',exact=True).click();route('carreras')
  def card(id):return page.locator(f'.career-tile[data-catalog="{id}"]')
  def no_overflow():check(page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'),'no horizontal overflow')
  def targets():
   for item in page.locator('main button,main summary,main input[type=search],.bottom-nav button').all():
    if item.is_visible():
     box=item.bounding_box();check(box['width']>=43.5 and box['height']>=43.5,'touch target '+item.inner_text()[:30])
  page.goto(URL);route('inicio');careers()
  check(page.locator('.bottom-nav button').all_text_contents()==['Inicio','Materias','Mapa','Planificar','Proyectar','Comunidad'],'six tabs')
  check(page.locator('.career-tile.is-selected h3').inner_text()=='Ingeniería en Sistemas de Información','selected card prominent')
  check(not page.locator('.archived-careers').evaluate('(e)=>e.open'),'archived collapsed')
  page.screenshot(path=str(OUT/'careers-390.png'),full_page=True)
  start()
  check(page.locator('.wizard-options button strong').all_text_contents()==['UADE','UBA','UCA','UTN'],'alphabetical universities')
  page.get_by_role('searchbox',name='Buscar universidad').fill('utn');check(page.locator('.wizard-options button').count()==1,'university filter')
  uni('UTN')
  page.get_by_role('searchbox',name='Buscar carrera').fill('INGENIERIA sistemas');check(page.locator('.wizard-options button').count()==1,'accent and token search')
  page.go_back();route('alta-universidad');check(page.get_by_role('searchbox').input_value()=='utn','back keeps university query')
  page.go_forward();route('alta-carrera');check(page.get_by_role('searchbox').input_value()=='INGENIERIA sistemas','forward keeps career query')
  career('Sistemas');check(page.locator('.wizard-review').inner_text().find('ya forma parte')>=0,'duplicate detected')
  check(page.get_by_role('button',name='Agregar carrera',exact=True).count()==0,'cannot duplicate')
  back();route('alta-carrera');page.get_by_role('searchbox').fill('industrial');career('Industrial')
  page.get_by_role('radio',name=re.compile('Plan 2007')).check()
  page.get_by_role('button',name='Ver en archivadas').click();route('carreras')
  check(page.locator('.archived-careers').evaluate('(e)=>e.open'),'duplicate archived reveals card')
  page.go_back();route('carreras');check(page.locator('.career-wizard').count()==0,'stale history cannot reopen completed add')
  start();uni('UBA');career('Actuario');check(page.get_by_role('radio').is_checked(),'single plan preselected')
  check('sin cambiar' in page.locator('.wizard-review').inner_text(),'existing context preserved warning')
  add();check(card('uba-actuario').count()==1,'added once')
  check(page.locator('.career-tile.is-selected').get_attribute('data-catalog')=='utn-sistemas-2023','existing selection preserved')
  start();uni('UADE');page.get_by_role('searchbox').fill('odontologia');check(page.locator('.wizard-options button').count()==0,'career scope respected')
  page.get_by_role('button',name='Limpiar búsqueda').click();check(page.locator('.wizard-options button').count()==2,'clear search')
  career('Industrial');check(page.get_by_role('radio').inner_text()=='' and 'A confirmar' in page.locator('.wizard-review').inner_text(),'literal unknown plan label')
  page.get_by_role('button',name='Cancelar',exact=True).click();route('carreras');check(card('uade-industrial').count()==0,'cancel makes no mutation')
  # First trajectory selection, repeated clicks, then archived-only exception.
  scenario('empty');check(page.get_by_role('button',name='Agregar mi primera carrera').is_visible(),'empty CTA')
  start();uni('UTN');career('Industrial');check(page.locator('.wizard-review').count()==0,'multiple plans need explicit selection')
  page.get_by_role('radio',name=re.compile('^Plan 2007')).check()
  check('primera carrera' in page.locator('.wizard-review').inner_text(),'first selection explained')
  page.get_by_role('button',name='Agregar carrera',exact=True).evaluate('(b)=>{b.click();b.click()}');route('carreras')
  check(page.locator('.career-tile').count()==1 and card('utn-industrial-2007').get_attribute('class').find('is-selected')>=0,'first added once and selected')
  card('utn-industrial-2007').get_by_role('button',name='Archivar',exact=True).click()
  check('Quedarás sin carrera seleccionada' in page.locator('.archive-confirm').inner_text(),'selected archive warning')
  page.locator('.archive-confirm').get_by_role('button',name='Cancelar').click();page.wait_for_timeout(80)
  check(card('utn-industrial-2007').get_by_role('button',name='Archivar',exact=True).evaluate('(b)=>b===document.activeElement'),'cancel returns focus')
  card('utn-industrial-2007').get_by_role('button',name='Archivar',exact=True).click()
  page.get_by_role('button',name='Confirmar archivo').click();page.wait_for_timeout(150)
  check(page.locator('.career-tile.is-selected').count()==0,'archive clears selected')
  check(page.locator('.archived-careers').evaluate('(e)=>e.open'),'archived-only expands')
  start();uni('UBA');career('Actuario');add();check(page.locator('.career-tile.is-selected').count()==0,'archived history prevents auto select')
  page.locator('.archived-careers summary').click();card('utn-industrial-2007').get_by_role('button',name='Restaurar').click();page.wait_for_timeout(120)
  check(page.locator('.career-tile.is-selected').count()==0,'restore never selects')
  # No selection with existing active trajectories.
  scenario('unselected');start();uni('UBA');career('Actuario');add();check(page.locator('.career-tile.is-selected').count()==0,'unselected collection stays unselected')
  # Legacy and closed states keep their authority.
  scenario('legacy');check(page.locator('.career-selector').count()==1 and page.locator('.career-manager').count()==0,'legacy separate')
  page.locator('.career-selector select').first.select_option('UBA');page.wait_for_timeout(120)
  check(page.locator('.career-selector').count()==1,'legacy change does not migrate')
  for name in ['frozen','blocked','invalid']:
   scenario(name);check(page.locator('.career-manager').count()==0,'blocked administration '+name)
  scenario('unavailable');card('utn-sistemas-2023').get_by_role('button',name='Seleccionar',exact=True).click();page.wait_for_timeout(120);check(card('catalogo-ficticio-no-disponible').get_by_role('button',name='Seleccionar').is_disabled(),'missing catalog cannot select')
  # Responsive and basic accessibility across page and wizard steps.
  scenario('instances')
  for w,h in [(320,568),(375,667),(390,844),(430,932),(844,390),(1280,800)]:
   page.set_viewport_size({'width':w,'height':h});no_overflow();targets()
   start();no_overflow();targets();uni('UTN');no_overflow();targets();career('Industrial');no_overflow();targets()
   page.get_by_role('radio',name=re.compile('^Plan 2007')).check();no_overflow();targets()
   page.get_by_role('button',name='Cancelar',exact=True).click();route('carreras')
  page.set_viewport_size({'width':390,'height':844});start();uni('UTN')
  page.screenshot(path=str(OUT/'search-390.png'),full_page=True)
  career('Industrial');page.get_by_role('radio',name=re.compile('^Plan 2007')).check();page.screenshot(path=str(OUT/'plans-390.png'),full_page=True)
  page.get_by_role('button',name='Cancelar',exact=True).click();route('carreras')
  page.evaluate("document.documentElement.style.fontSize='200%'");no_overflow();targets();page.evaluate("document.documentElement.style.fontSize=''")
  start();page.get_by_role('searchbox').focus();check(page.get_by_role('searchbox').evaluate('(e)=>e.labels.length===1'),'search has accessible label')
  check(page.locator('[aria-current=step]').count()==1,'step announced')
  page.keyboard.press('Tab');check(page.locator('.wizard-options button').first.evaluate('(e)=>e===document.activeElement'),'keyboard reaches first option')
  page.keyboard.press('Enter');route('alta-carrera')
  page.evaluate("document.documentElement.style.fontSize='200%'");no_overflow();targets();page.evaluate("document.documentElement.style.fontSize=''")
  page.get_by_role('button',name='Atrás',exact=True).click();route('alta-universidad')
  uni('UBA');career('Actuario')
  check('Actuario' in page.locator('.wizard-review').inner_text(),'changing university clears downstream choice')
  page.get_by_role('button',name='Cancelar',exact=True).click();route('carreras')
  ctx.set_offline(True)
  start();uni('UBA');career('Actuario');add()
  check(card('uba-actuario').count()==1,'loaded demo works offline without backend')
  ctx.set_offline(False)
  start()
  # Direct URL reload cannot revive a draft or create a trajectory.
  page.reload();route('carreras');check(page.locator('.career-tile.is-selected').get_attribute('data-catalog')=='utn-sistemas-2023','reload discards draft safely')
  # CSP denies executable inline scripts and browser fetch, even same-origin.
  check(page.evaluate("""async()=>{try{await fetch('/index.html');return false}catch{return true}}"""),'CSP blocks fetch')
  check(page.evaluate("""()=>{const s=document.createElement('script');s.textContent='window.__inlineRan=true';document.body.append(s);return !window.__inlineRan}"""),'CSP blocks inline JS')
  check(not errors,'no JS errors '+str(errors));check(not events,'no sensitive actions '+str(events))
  check(all(r.startswith(URL) or r.startswith('data:') for r in requests),'no external requests')
  check(not page.locator('a[download],iframe,object,embed,link[rel=manifest]').count(),'no installation or executable download mechanisms')
  check(not page.evaluate('navigator.serviceWorker.controller !== null'),'no service worker')
  result={'checks':checks,'externalRequests':[r for r in requests if not r.startswith(URL) and not r.startswith('data:')],'errors':errors,'sensitiveEvents':events,'browser':'Chromium','physicalSafariTested':False}
  (OUT/'result.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2));browser.close()
finally:
 server.terminate();server.wait(timeout=10)
