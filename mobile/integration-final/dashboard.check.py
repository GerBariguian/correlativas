"""Dashboard functional, responsive, AX/keyboard, contrast and local-only checks."""
from pathlib import Path
from collections import Counter
import subprocess,time,urllib.request,json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'.tools/mobile-integration-checks';OUT.mkdir(exist_ok=True)
URL='http://127.0.0.1:5201/'
server=subprocess.Popen(['node','node_modules/vite/bin/vite.js','preview','--config','mobile/integration-final/vite.config.mjs','--port','5201','--strictPort'],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
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
  def tab(label):page.locator('.bottom-nav button').filter(has_text=label).click();page.wait_for_timeout(90)
  def home():tab('Inicio')
  def scenario(name):
   page.get_by_role('button',name='Abrir Cuenta de Alex, perfil ficticio').click();page.locator('.context-scenarios summary').click();page.locator('#demo-scenario').select_option(name);page.wait_for_timeout(100);home()
  def counts():return [int(x) for x in page.locator('.dashboard-state strong').all_text_contents()]
  def audit():
   check(page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'no horizontal overflow')
   for el in page.locator('.dashboard-mobile button,.dashboard-mobile summary,.dashboard-empty button').all():
    if el.is_visible():
     box=el.bounding_box();check(box['width']>=43.5 and box['height']>=43.5,'44px touch target')
   cdp=ctx.new_cdp_session(page);nodes=cdp.send('Accessibility.getFullAXTree')['nodes'];cdp.detach()
   controls=[n for n in nodes if not n.get('ignored') and n.get('role',{}).get('value') in ['button','progressbar']]
   check(all(n.get('name',{}).get('value','').strip() for n in controls),'AX buttons/progress named')
   check(page.locator('.bottom-nav button').all_text_contents()==['Inicio','Materias','Mapa','Planificar','Proyectar','Comunidad'],'six bottom destinations preserved')
  page.goto(URL);page.locator('.dashboard-mobile').wait_for()
  initial=counts();check(len(initial)==4 and sum(initial)==44,'four totals sum to catalog size')
  check(page.locator('.context-selector').inner_text().find('UTN')>=0 and 'Plan 2023' in page.locator('.context-selector').inner_text(),'context university and plan visible')
  check('Sistemas' in page.locator('.context-selector').inner_text(),'current career visible')
  check(int(page.get_by_role('progressbar').get_attribute('aria-valuenow'))==round(initial[0]/44*100),'percentage from approved count')
  check('sin IA' in page.locator('.dashboard-guidance-note').inner_text(),'guidance explains rule basis')
  check('No garantiza' in page.locator('.dashboard-guidance-note').inner_text(),'guidance not an enrollment guarantee')
  check(page.locator('.dashboard-guidance-item').count()==6,'six existing web suggestions in DOM')
  check(page.locator('.dashboard-guidance-item:visible').count()==3,'first three suggestions avoid saturation')
  page.locator('.dashboard-guidance summary').click();check(page.locator('.dashboard-guidance-item:visible').count()==6,'remaining suggestions accessible');page.locator('.dashboard-guidance summary').click()
  # Each status goes to the matching list and clears stale advanced criteria/search.
  for i,status in enumerate(['Aprobada','Regularizada','Cursando','Pendiente']):
   page.locator('.dashboard-state').nth(i).click();page.wait_for_timeout(100)
   check(page.locator('.subject-result-row').count()==initial[i],'status count matches list '+status)
   check(all(t==status for t in page.locator('.subject-result-row .demo-status').all_text_contents()),'status filter '+status)
   check(page.get_by_role('searchbox').input_value()=='','state action clears query');home()
  # Full list distribution is the same shared progress source.
  page.locator('.dashboard-shortcuts button').filter(has_text='Materias').click();page.locator('.filter-scroller button').filter(has_text='Todas').click()
  dist=Counter(page.locator('.subject-result-row .demo-status').all_text_contents());check([dist[s] for s in ['Aprobada','Regularizada','Cursando','Pendiente']]==initial,'dashboard/list distribution coherent')
  page.get_by_role('searchbox').fill('does-not-exist');home()
  page.get_by_role('button',name='Podés cursar:',exact=False).click();page.wait_for_timeout(90)
  check(page.get_by_role('searchbox').input_value()=='','eligibility action clears query')
  check(page.get_by_role('button',name='Quitar filtro Podés cursar',exact=True).count()==1,'course advanced criterion applied')
  course_count=page.locator('.subject-result-row').count();home()
  check(int(page.locator('.dashboard-option').first.locator('strong').inner_text())==course_count,'course count coherent')
  page.get_by_role('button',name='Finales habilitados:',exact=False).click();page.wait_for_timeout(90)
  check(page.locator('.subject-result-row').count()==2,'finals enabled list count')
  check(page.get_by_role('button',name='Quitar filtro Finales habilitados',exact=True).count()==1,'finals filter applied');home()
  check(page.locator('.dashboard-option').nth(1).locator('strong').inner_text()=='2','finals count coherent')
  for label,dest in [('Mapa','mapa'),('Planificar','planificador')]:
   page.locator('.dashboard-shortcuts button').filter(has_text=label).click();page.wait_for_url(URL+'#'+dest);check(True,'shortcut '+dest);page.go_back();page.locator('.dashboard-mobile').wait_for()
  # Editing from the existing subject panel refreshes dashboard metrics, not other records.
  page.locator('.dashboard-state').first.click();page.locator('.subject-result-row').first.click();page.locator('.status-actions button').filter(has_text='Cursando').click();page.locator('.subject-detail-panel [data-academic-phase=success]').wait_for();page.get_by_role('button',name='Cerrar',exact=True).click();page.locator('.subject-detail-panel').wait_for(state='hidden');home()
  check(counts()==[initial[0]-1,initial[1],initial[2]+1,initial[3]],'confirmed state updates exactly two category counts')
  # Independent context; no old progress, query or recommendations carried over.
  page.get_by_role('button',name='Cambiar contexto académico').click();page.locator('.career-tile[data-catalog="utn-industrial-2023"]').get_by_role('button',name='Seleccionar',exact=True).click();page.wait_for_timeout(90);home()
  check(counts()[0:3]==[0,0,0],'new context own empty progress')
  check(page.get_by_role('heading',name='Todavía no registraste estados').is_visible(),'no record explanation')
  check('Industrial' in page.locator('.context-selector').inner_text(),'context switched clearly')
  page.get_by_role('button',name='Cambiar contexto académico').click()
  for catalog in ['utn-industrial-2023','utn-sistemas-2023']:
   page.locator(f'.career-tile[data-catalog="{catalog}"]').get_by_role('button',name='Archivar',exact=True).click();page.get_by_role('button',name='Confirmar archivo',exact=True).click();page.wait_for_timeout(100)
  home();check(page.get_by_role('heading',name='Tus carreras están archivadas').is_visible(),'archived-only context has restoration guidance')
  check(page.locator('.dashboard-progress').count()==0,'archived-only context has no borrowed indicators')
  scenario('missing-progress');check(counts()==[0,0,0,44],'absent record not inherited progress')
  scenario('empty');check(page.get_by_role('heading',name='Tu recorrido empieza con una carrera').is_visible(),'no careers state')
  check(page.locator('.dashboard-progress').count()==0,'no misleading metrics without context')
  scenario('unselected');check(page.get_by_role('heading',name='Seleccioná una carrera').is_visible(),'unselected distinct from empty')
  scenario('unavailable');check(page.get_by_role('heading',name='Catálogo no disponible').is_visible(),'missing catalog state')
  scenario('invalid-progress');check(page.get_by_role('heading',name='Progreso no disponible').is_visible(),'invalid data not treated as zero progress')
  for name in ['frozen','blocked','invalid']:
   scenario(name);check(page.get_by_role('heading',name='Tu contexto requiere revisión').is_visible(),'suspended context '+name);check(page.locator('.dashboard-progress').count()==0,'suspended hides metrics')
  scenario('instances')
  # Responsive, enlarged text, keyboard navigation, AX names and control dimensions.
  for w,h in [(320,568),(375,667),(390,844),(430,932),(844,390),(1280,800),(320,340)]:
   page.set_viewport_size({'width':w,'height':h})
   for scale in ['100%','200%']:
    page.evaluate('(v)=>document.documentElement.style.fontSize=v',scale);audit()
    page.locator('.dashboard-state').first.focus();page.keyboard.press('Tab');check(page.locator('.dashboard-state').nth(1).evaluate('(e)=>e===document.activeElement'),'keyboard moves through four states')
  page.evaluate("document.documentElement.style.fontSize=''");page.set_viewport_size({'width':390,'height':844});page.evaluate('scrollTo(0,0)');page.screenshot(path=str(OUT/'dashboard-390.png'))
  page.locator('.dashboard-eligibility').scroll_into_view_if_needed();page.screenshot(path=str(OUT/'dashboard-options-390.png'))
  # Contrast on the introduced text with nearest opaque ancestor background.
  contrast=page.evaluate("""()=>{const rgb=s=>s.match(/[\\d.]+/g).map(Number);const lum=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);return [...document.querySelectorAll('.dashboard-heading h1,.dashboard-heading p,.dashboard-progress h2,.dashboard-progress p,.dashboard-state-label,.dashboard-state strong,.dashboard-option span,.dashboard-guidance-note,.dashboard-guidance-item h3,.dashboard-guidance-item p,.dashboard-shortcuts button')].filter(e=>e.getBoundingClientRect().height>0).map(e=>{const fg=rgb(getComputedStyle(e).color);let bg=[255,255,255],node=e;while(node){const c=rgb(getComputedStyle(node).backgroundColor);if(c.length===3||c[3]===1){bg=c;break}node=node.parentElement}const l=[lum(fg),lum(bg)].sort((a,b)=>b-a);return {text:e.textContent.slice(0,50),ratio:(l[0]+.05)/(l[1]+.05)}})}""")
  check(all(x['ratio']>=4.5 for x in contrast),'new dashboard text contrast >=4.5:1 '+str(contrast))
  ctx.set_offline(True);page.locator('.dashboard-state').first.click();page.locator('.subject-result-row').first.click();page.locator('.status-actions button').filter(has_text='Regularizada').click();page.locator('.subject-detail-panel [data-academic-phase=success]').wait_for();page.get_by_role('button',name='Cerrar',exact=True).click();page.locator('.subject-detail-panel').wait_for(state='hidden');home();check(counts()[1]==initial[1]+1,'dashboard refresh works without network after loading');ctx.set_offline(False)
  check(not errors,'no JS errors '+str(errors));check(not events,'no popups/downloads')
  check(all(r.startswith(URL) or r.startswith('data:') for r in requests),'no external requests')
  check(not page.locator('input#grade,iframe,link[rel=manifest],a[download]').count(),'no notes/install hooks')
  check(page.evaluate("sessionStorage.length===0 && Object.keys(localStorage).every(k=>k==='correlativas-demo-235-academic-v1')"),'only namespaced demo storage')
  result={'checks':checks,'errors':errors,'externalRequests':[],'unexpectedEvents':events,'accessibility':'Chromium AX names, keyboard, 44px targets, 200% root text, sampled text contrast; not axe/full WCAG audit','minimumTextContrast':min(x['ratio'] for x in contrast),'physicalSafariTested':False}
  (OUT/'dashboard.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2));b.close()
finally:server.terminate();server.wait(timeout=10)
