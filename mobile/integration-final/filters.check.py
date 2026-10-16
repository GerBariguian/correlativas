"""Functional, keyboard/AX-tree, responsive, contrast and security audit of Materias."""
from pathlib import Path
import json,subprocess,time,urllib.request
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'.tools/mobile-integration-checks';OUT.mkdir(exist_ok=True)
URL='http://127.0.0.1:5194/'
server=subprocess.Popen(['node','node_modules/vite/bin/vite.js','preview','--config','mobile/integration-final/vite.config.mjs','--port','5194','--strictPort'],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
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
  def codes():return page.locator('.subject-result-row').evaluate_all('(els)=>els.map(e=>e.dataset.subjectCode)')
  def panel():page.get_by_role('button',name='Abrir filtros avanzados',exact=False).click();page.locator('.subject-filter-form').wait_for()
  def apply():page.locator('.subject-filter-actions button[type=submit]').click();page.locator('.subject-filter-form').wait_for(state='hidden');page.wait_for_timeout(100)
  def clear():page.get_by_role('button',name='Limpiar búsqueda y filtros',exact=True).click()
  def bounds():check(page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'no horizontal page overflow')
  def accessible_controls():
   cdp=ctx.new_cdp_session(page);tree=cdp.send('Accessibility.getFullAXTree')['nodes'];cdp.detach()
   controls=[n for n in tree if not n.get('ignored') and n.get('role',{}).get('value') in ['button','checkbox','combobox','searchbox']]
   check(len(controls)>0,'AX controls exposed')
   check(all(n.get('name',{}).get('value','').strip() for n in controls),'every exposed control has accessible name')
  def touch_targets():
   selector='.subject-filter-trigger,.filter-scroller button,.applied-subject-filters button,.subject-clear-all,.subject-filter-actions button,.subject-filter-form select,.subject-criterion,.subject-result-row'
   for el in page.locator(selector).all():
    if el.is_visible():
     box=el.bounding_box();check(box['width']>=43.5 and box['height']>=43.5,'44px touch target')
  page.goto(URL);tab('Materias')
  initial=codes();check(len(initial)==44,'real catalog row count')
  check(len(set(initial))==44,'unique subject identities')
  check(page.locator('.filter-scroller button').all_text_contents()==['Todas','Cursando','Regularizadas','Aprobadas','Pendientes'],'four quick states plus all')
  page.get_by_role('searchbox',name='Buscar materia').fill('ALGEBRA');check(len(codes())==1,'case and accent insensitive search')
  match=codes()[0];page.get_by_role('searchbox').fill(match.lower());check(codes()==[match],'search by code')
  page.get_by_role('searchbox').fill('<img src=x onerror=alert(1)>');check(len(codes())==0,'search rendered as text, no HTML injection')
  page.get_by_role('button',name='Ver todas',exact=True).click();check(codes()==initial,'clear restores exact catalog order')
  for state,label in [('Cursando','Cursando'),('Regularizada','Regularizadas'),('Aprobada','Aprobadas'),('Pendiente','Pendientes')]:
   page.locator('.filter-scroller button').filter(has_text=label).click()
   check(all(text==state for text in page.locator('.subject-result-row .demo-status').all_text_contents()),'quick state '+state)
   clear()
  # Panel uses a draft: cancelling or browser Back never commits.
  panel();page.locator('#subject-state').select_option('Aprobada');page.get_by_role('checkbox',name='Bloqueadas',exact=True).check()
  check('0 resultados' in page.locator('.subject-filter-preview').inner_text(),'AND preview contradictory criteria')
  page.locator('.subject-filter-actions').get_by_role('button',name='Cancelar').click();page.locator('.subject-filter-form').wait_for(state='hidden')
  check(codes()==initial,'cancel leaves applied criteria untouched')
  panel();page.locator('#subject-level').select_option(index=1);page.go_back();page.locator('.subject-filter-form').wait_for(state='hidden')
  check(codes()==initial,'Back cancels draft')
  page.go_forward();page.locator('.subject-filter-form').wait_for();check(page.locator('#subject-level').input_value()=='','Forward opens current applied state')
  page.keyboard.press('Escape');page.locator('.subject-filter-form').wait_for(state='hidden');page.wait_for_timeout(100)
  check(page.evaluate("document.activeElement.matches('.subject-filter-trigger,#navigation-content')"),'logical focus after dismiss')
  # Intersections; zero results never silently relax criteria.
  panel();page.get_by_role('checkbox',name='Podés cursar',exact=True).check();page.get_by_role('checkbox',name='Bloqueadas',exact=True).check();apply()
  check(codes()==[],'course AND blocked is empty')
  check(page.locator('.applied-subject-filters button').count()==2,'active criteria visible')
  check('2 activos' in page.locator('.subject-filter-trigger').get_attribute('aria-label'),'active filter count')
  page.get_by_role('button',name='Quitar filtro Bloqueadas',exact=True).click()
  check(len(codes())>0,'remove one criterion')
  check(all('Habilitada para cursar' in t for t in page.locator('.subject-result-row').all_text_contents()),'course eligibility from model')
  panel();page.locator('#subject-state').select_option('Pendiente');page.locator('#subject-level').select_option(index=1);apply()
  check(all('1° Año' in t for t in page.locator('.subject-result-row').all_text_contents()),'state level and course intersection')
  check(codes()==[c for c in initial if c in codes()],'intersection preserves source order')
  clear();panel();page.get_by_role('checkbox',name='Finales habilitados',exact=True).check();apply()
  check(len(codes())==2,'final eligibility count')
  check(all('Final habilitado' in t and 'Regularizada' in t for t in page.locator('.subject-result-row').all_text_contents()),'finals require regularized and prerequisites')
  clear();panel();page.get_by_role('checkbox',name='Bloqueadas',exact=True).check();apply()
  check(len(codes())>0 and all('Correlativas pendientes' in t for t in page.locator('.subject-result-row').all_text_contents()),'blocked pending rows')
  # Blocked status remains editable; other rows do not cascade.
  blocked_code=codes()[0];page.locator('.subject-result-row').first.click();page.locator('.status-actions button').filter(has_text='Aprobada').click();page.locator('.demo-sheet [data-academic-phase=success]').wait_for()
  page.get_by_role('button',name='Cerrar',exact=True).click();page.locator('.demo-sheet').wait_for(state='hidden');check(blocked_code not in codes(),'updated row leaves blocked results')
  clear();page.get_by_role('searchbox').fill(blocked_code);check(page.locator('.subject-result-row .demo-status').inner_text()=='Aprobada','manual state accepted without prerequisite enforcement');clear()
  panel();page.get_by_role('checkbox',name='Desbloqueos',exact=True).check();apply();check(len(codes())>0,'direct dependency filter')
  panel();page.locator('#subject-state').select_option('Aprobada');page.get_by_role('button',name='Limpiar filtros',exact=True).click();check(page.locator('#subject-state').input_value()=='' and not page.get_by_role('checkbox',name='Desbloqueos',exact=True).is_checked(),'clear draft controls');apply();check(codes()==initial,'apply cleared draft restores rows')
  # Same-context detail/history and tab navigation preserve the list's search/filter state.
  page.get_by_role('searchbox').fill('algebra');page.locator('.subject-result-row').first.click();page.go_back();page.locator('.demo-sheet').wait_for(state='hidden');check(page.get_by_role('searchbox').input_value()=='algebra','detail Back retains query')
  tab('Mapa');tab('Materias');check(page.get_by_role('searchbox').input_value()=='algebra','tab round trip retains query')
  # Context change discards search/filter draft and preserves per-career status.
  panel();page.locator('#subject-state').select_option('Regularizada');page.keyboard.press('Escape');page.locator('.subject-filter-form').wait_for(state='hidden')
  page.get_by_role('button',name='Cambiar contexto académico').click();page.locator('.career-tile[data-catalog="utn-industrial-2023"]').get_by_role('button',name='Seleccionar',exact=True).click();page.wait_for_timeout(100);tab('Materias')
  check(page.get_by_role('searchbox').input_value()=='' and not page.locator('.applied-subject-filters button').count(),'filters and query reset across context')
  check(all(t=='Pendiente' for t in page.locator('.demo-status').all_text_contents()),'other trajectory unchanged')
  # Legacy CBC is a real catalog label, not synthesized as a numbered year.
  page.get_by_role('button',name='Abrir Cuenta de Alex, perfil ficticio').click();page.locator('.context-scenarios summary').click();page.locator('#demo-scenario').select_option('legacy');page.wait_for_timeout(100)
  page.get_by_role('button',name='Cambiar contexto académico').click();page.locator('.career-selector select').first.select_option('UBA');page.wait_for_timeout(100);page.locator('.career-selector select').nth(1).select_option('Odontología');page.wait_for_timeout(100);tab('Materias')
  panel();check('CBC' in page.locator('#subject-level option').all_text_contents(),'CBC option preserved');page.locator('#subject-level').select_option('CBC');apply();check(len(codes())==6 and all('CBC' in t for t in page.locator('.subject-result-row').all_text_contents()),'CBC filters exact entries')
  clear()
  # Responsive, keyboard/AX-tree and enlarged text across list and panel.
  for width,height in [(320,568),(375,667),(390,844),(430,932),(844,390),(1280,800)]:
   page.set_viewport_size({'width':width,'height':height});bounds();touch_targets();accessible_controls();panel();bounds();touch_targets();accessible_controls()
   page.locator('#subject-state').focus();page.keyboard.press('Tab');check(page.locator('#subject-level').evaluate('(e)=>e===document.activeElement'),'logical keyboard order')
   for _ in range(12):
    page.keyboard.press('Tab');check(page.evaluate("Boolean(document.activeElement.closest('[role=dialog]'))"),'focus stays within modal')
   page.keyboard.press('Escape');page.locator('.subject-filter-form').wait_for(state='hidden')
  page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(OUT/'subjects-390.png'))
  page.evaluate("document.documentElement.style.fontSize='200%'");bounds();panel();bounds();touch_targets();page.keyboard.press('Escape');page.locator('.subject-filter-form').wait_for(state='hidden');page.evaluate("document.documentElement.style.fontSize=''")
  panel();page.screenshot(path=str(OUT/'filters-390.png'))
  check(page.locator('.subject-filter-actions button[type=submit]').is_visible(),'apply action available')
  check(page.locator('.subject-filter-actions button[type=submit]').bounding_box()['y'] + page.locator('.subject-filter-actions button[type=submit]').bounding_box()['height'] <= 844,'apply action within viewport')
  # Automated text contrast on the newly introduced content; not a full WCAG audit.
  contrast=page.evaluate("""()=>{const rgb=s=>s.match(/[\\d.]+/g).map(Number);const lum=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);const contrast=e=>{const fg=rgb(getComputedStyle(e).color);let bg=[255,255,255];let node=e;while(node){const c=rgb(getComputedStyle(node).backgroundColor);if(c.length===3||c[3]===1){bg=c;break}node=node.parentElement}const l=[lum(fg),lum(bg)].sort((a,b)=>b-a);return(l[0]+.05)/(l[1]+.05)};return [...document.querySelectorAll('.subject-filter-form label,.subject-filter-form legend,.subject-filter-form>p,.subject-filter-form>small,.subject-filter-form button')].filter(e=>e.getBoundingClientRect().height>0).map(e=>({text:e.textContent.slice(0,60),ratio:contrast(e)}))}""")
  check(all(x['ratio']>=4.5 for x in contrast),'new panel text contrast >= 4.5:1 '+str(contrast))
  page.keyboard.press('Escape');page.locator('.subject-filter-form').wait_for(state='hidden')
  check(not errors,'no JS errors '+str(errors));check(not events,'no popups/downloads')
  check(all(r.startswith(URL) or r.startswith('data:') for r in requests),'no external network')
  check(not page.locator('input#grade,link[rel=manifest],iframe,a[download]').count(),'no grade integration or installation mechanisms')
  result={'checks':checks,'errors':errors,'externalRequests':[],'unexpectedEvents':events,'accessibility':'Chromium AX tree, names, keyboard/modal focus, 44px targets, 200% root text, new panel text contrast; not axe or a full WCAG certification','panelContrast':contrast,'physicalSafariTested':False}
  (OUT/'filters.json').write_text(json.dumps(result,indent=2));print(json.dumps({k:v for k,v in result.items() if k!='panelContrast'},indent=2));b.close()
finally:server.terminate();server.wait(timeout=10)
