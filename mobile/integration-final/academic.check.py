"""Browser checks of the shared presentation and fake asynchronous operations."""
from pathlib import Path
import json,subprocess,time,urllib.request
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'.tools/mobile-integration-checks';OUT.mkdir(exist_ok=True)
URL='http://127.0.0.1:5193/'
server=subprocess.Popen(['node','node_modules/vite/bin/vite.js','preview','--config','mobile/integration-final/vite.config.mjs','--port','5193','--strictPort'],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
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
  page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url))
  page.on('download',lambda _:events.append('download'));page.on('popup',lambda _:events.append('popup'))
  def route(name):page.wait_for_url(URL+'#'+name);page.wait_for_timeout(65)
  def tab(name):page.locator('.bottom-nav button').filter(has_text=name).click()
  def account():page.get_by_role('button',name='Abrir Cuenta de Alex, perfil ficticio').click();route('cuenta')
  def settings(mode='success',delay='350',scenario=None):
   account();page.locator('.context-scenarios summary').click()
   if scenario:
    page.locator('#demo-scenario').select_option(scenario);page.wait_for_timeout(80)
    if not page.locator('.context-scenarios').evaluate('(e)=>e.open'):page.locator('.context-scenarios summary').click()
   page.locator('#academic-result').select_option(mode);page.locator('#academic-delay').select_option(delay)
  def subjects():tab('Materias');route('materias');page.locator('.filter-scroller button').filter(has_text='Todas').click()
  def first_state():return page.locator('.subject-list .demo-status').first.inner_text()
  def open_first():page.locator('.subject-list .demo-subject-row').first.click();page.locator('.demo-sheet').wait_for()
  def edit(value):page.locator('.demo-sheet .status-actions button').filter(has_text=value).click()
  def feedback(phase):page.locator(f'.demo-sheet [data-academic-phase={phase}]').wait_for()
  def close():page.get_by_role('button',name='Cerrar',exact=True).click();page.locator('.demo-sheet').wait_for(state='hidden')
  def select(id):
   page.get_by_role('button',name='Cambiar contexto académico').click();route('carreras')
   page.locator(f'.career-tile[data-catalog="{id}"]').get_by_role('button',name='Seleccionar',exact=True).click();page.wait_for_timeout(100)
  page.goto(URL);route('inicio')
  check(page.locator('.overview-card').count()==4,'four academic states in redesigned dashboard')
  check('promedio' not in page.locator('body').inner_text().lower(),'no fictitious average in interface')
  approved_before=int(page.locator('.overview-card strong').first.inner_text())
  subjects();before=first_state();target='Cursando' if before!='Cursando' else 'Aprobada'
  open_first();check(page.locator('input#grade').count()==0,'grade editor removed')
  edit(target);feedback('saving')
  check(page.locator('.academic-editor').evaluate('(e)=>e.disabled'),'edit disabled during save')
  check(page.locator('.demo-sheet .status').first.inner_text()==before,'confirmed state retained while pending')
  feedback('success');check(page.locator('.demo-sheet .status').first.inner_text()==target,'success applies requested state')
  close();check(first_state()==target,'list reflects confirmed state')
  tab('Inicio');route('inicio')
  expected=approved_before+(1 if target=='Aprobada' else 0)-(1 if before=='Aprobada' else 0)
  check(int(page.locator('.overview-card strong').first.inner_text())==expected,'dashboard agrees with subjects')
  # Failure and conflict preserve the same prior status and block until refresh.
  for mode in ['error','conflict']:
   settings(mode);subjects();before=first_state();open_first();edit('Pendiente' if before!='Pendiente' else 'Aprobada');feedback(mode)
   check(page.locator('.demo-sheet .status').first.inner_text()==before,mode+' preserves state')
   check(page.locator('.academic-editor').evaluate('(e)=>e.disabled'),mode+' gates edits')
   page.screenshot(path=str(OUT/(mode+'-390.png')),full_page=True)
   page.locator('.demo-sheet').get_by_role('button',name='Actualizar datos ficticios').click();feedback('loading');feedback('success')
   check(not page.locator('.academic-editor').evaluate('(e)=>e.disabled'),'explicit refresh unlocks')
   check(page.locator('.demo-sheet .status').first.inner_text()==before,'refresh does not replay failed change')
   close()
  # A pending save must not modify B or A after A -> B -> A.
  settings('success','4000');subjects();before=first_state();open_first();edit('Aprobada' if before!='Aprobada' else 'Pendiente');feedback('saving')
  close();select('utn-industrial-2023');subjects();industrial_before=page.locator('.subject-list .demo-status').all_text_contents()
  select('utn-sistemas-2023');subjects();page.wait_for_timeout(4100)
  check(first_state()==before,'late response discarded after A-B-A')
  select('utn-industrial-2023');subjects();check(page.locator('.subject-list .demo-status').all_text_contents()==industrial_before,'B never receives A data')
  # Keep independent context values, including legacy catalog switches.
  settings('success','350');subjects();open_first();edit('Regularizada');feedback('success');close()
  check(first_state()=='Regularizada','industrial own update')
  select('utn-sistemas-2023');subjects();check(first_state()==before,'systems own update retained')
  settings('success','350','legacy');subjects();open_first();edit('Cursando');feedback('success');close()
  page.get_by_role('button',name='Cambiar contexto académico').click();route('carreras')
  page.locator('.career-selector select').first.select_option('UBA');page.wait_for_timeout(100)
  page.locator('.career-selector select').first.select_option('UTN');page.wait_for_timeout(100)
  # Explicit plan selector if required to return to Systems; no equivalent progress copying.
  selects=page.locator('.career-selector select')
  selects.nth(1).select_option('Ingeniería en Sistemas de Información');page.wait_for_timeout(100)
  subjects();check(first_state()=='Cursando','legacy history retained by catalog')
  # Loading can be reviewed on both normal screens and survives navigation only.
  settings('success','4000','instances')
  page.get_by_role('button',name='Simular carga académica').click()
  tab('Inicio');route('inicio');check(page.locator('[data-academic-phase=loading]').count()==1,'home loading state')
  subjects();check(page.locator('[data-academic-phase=loading]').count()==1,'subjects same loading state')
  open_first();check(page.locator('.academic-editor').evaluate('(e)=>e.disabled'),'loading gates edit');close()
  page.locator('[data-academic-phase=success]').wait_for();check(True,'load completes locally')
  # Missing document is distinct from unreadable document.
  settings(scenario='missing-progress');tab('Inicio');route('inicio');check(page.locator('.overview-card strong').first.inner_text()=='0','absent instance record starts empty')
  settings(scenario='invalid-progress');tab('Inicio');route('inicio')
  check(page.get_by_role('heading',name='Progreso no disponible').is_visible(),'invalid record not a zero-progress dashboard')
  check(page.locator('.journey-card').count()==0,'invalid record hides misleading indicators')
  tab('Materias');route('materias');check(page.locator('.subject-list .demo-subject-row').count()==0,'invalid record not an editable pending list')
  settings('success','350','instances')
  # Other destinations retain their navigation and original demo behavior.
  for label,name in [('Mapa','mapa'),('Planificar','planificador'),('Proyectar','proyeccion'),('Comunidad','comunidad')]:
   tab(label);route(name);check(page.locator('.bottom-nav [aria-current=page]').inner_text()==label,'destination '+label)
  tab('Materias');route('materias');open_first()
  page.get_by_role('button',name='Ampliar panel').click();check(page.locator('[role=dialog]').count()==1,'expand keeps a single dialog')
  page.get_by_role('button',name='Reducir panel').click();check(page.locator('.subject-modal').count()==0,'no nested subject modal')
  page.go_back();page.locator('.demo-sheet').wait_for(state='hidden');check(True,'single Back closes subject detail')
  # State changes are permitted even for a subject with blocked prerequisites.
  page.locator('.demo-subject-row').filter(has_text='Análisis Matemático II').first.click()
  if page.locator('.demo-sheet').count():
   edit('Aprobada');feedback('success');check(page.locator('.demo-sheet .status').first.inner_text()=='Aprobada','state recording not gated by requirements');close()
  for w,h in [(320,568),(390,844),(430,932),(844,390)]:
   page.set_viewport_size({'width':w,'height':h});settings('error','350');subjects();open_first();edit('Pendiente');feedback('error')
   check(page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'no overflow '+str(w))
   button=page.locator('.demo-sheet').get_by_role('button',name='Actualizar datos ficticios');box=button.bounding_box();check(box['height']>=44 and box['width']>=44,'recovery touch target')
   check(page.locator('.demo-sheet [role=alert]').count()==1,'error announced accessibly')
   button.click();feedback('success');close()
  # Once loaded, a save requires no connectivity and no persistence mechanism.
  settings('success','350');ctx.set_offline(True);subjects();open_first();edit('Regularizada');feedback('success');close();check(first_state()=='Regularizada','offline local save');ctx.set_offline(False)
  check(not errors,'no JS errors '+str(errors));check(not events,'no downloads/popups')
  check(all(r.startswith(URL) or r.startswith('data:') for r in requests),'no external requests')
  check(not page.locator('iframe,object,embed,link[rel=manifest],a[download]').count(),'no installation/download hooks')
  check(page.evaluate("sessionStorage.length===0 && Object.keys(localStorage).every(k=>k==='correlativas-demo-235-academic-v1')"),'only namespaced demo storage')
  result={'checks':checks,'errors':errors,'externalRequests':[r for r in requests if not r.startswith(URL) and not r.startswith('data:')],'unexpectedEvents':events,'physicalSafariTested':False}
  (OUT/'academic.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2));b.close()
finally:server.terminate();server.wait(timeout=10)
