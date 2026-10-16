"""Real bundled demo: cards, local resume, simulated failures, context isolation and AX."""
from pathlib import Path
import subprocess,time,urllib.request,json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'.tools/mobile-integration-checks';OUT.mkdir(exist_ok=True)
URL='http://127.0.0.1:5203/';KEY='correlativas-demo-235-academic-v1'
server=subprocess.Popen(['node','node_modules/vite/bin/vite.js','preview','--config','mobile/integration-final/vite.config.mjs','--port','5203','--strictPort'],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
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
  page.add_init_script("""window.__sensitiveCalls=[];for(const [obj,name] of [[window,'open'],[window,'fetch'],[navigator,'getUserMedia']])if(obj[name])obj[name]=()=>{__sensitiveCalls.push(name);throw Error('Unexpected API')};if(navigator.geolocation)navigator.geolocation.getCurrentPosition=()=>__sensitiveCalls.push('geolocation');if(window.Notification)Notification.requestPermission=()=>__sensitiveCalls.push('notifications');if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>__sensitiveCalls.push('camera');""")
  def tab(label):page.locator('.bottom-nav button').filter(has_text=label).click();page.wait_for_timeout(70)
  def scenario(name):
   page.get_by_role('button',name='Abrir Cuenta de Alex, perfil ficticio').click();page.locator('.context-scenarios summary').click();page.locator('#demo-scenario').select_option(name);page.wait_for_timeout(100);tab('Inicio')
  def start():page.get_by_role('button',name='Configurar mis materias',exact=False).click();page.locator('.onboarding-mobile-page').wait_for()
  def title():return page.locator('#onboarding-subject-title').inner_text()
  def snapshot():return page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))',KEY)
  def choose(status):
   page.locator('.onboarding-choice').filter(has_text=status).click();page.locator('.onboarding-mobile-page [data-academic-phase=success]').wait_for();page.wait_for_timeout(70)
  def career(catalog):
   page.get_by_role('button',name='Cambiar contexto académico').click();page.locator(f'.career-tile[data-catalog="{catalog}"]').get_by_role('button',name='Seleccionar',exact=True).click();page.wait_for_timeout(100)
  def simulation(mode,delay='350'):
   page.get_by_role('button',name='Abrir Cuenta de Alex, perfil ficticio').click();page.locator('.context-scenarios summary').click();page.locator('#academic-result').select_option(mode);page.locator('#academic-delay').select_option(delay);tab('Inicio');start()
  def audit():
   check(page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'no horizontal page overflow')
   check(page.locator('.bottom-nav button').all_text_contents()==['Inicio','Materias','Mapa','Planificar','Proyectar','Comunidad'],'six tabs')
   boxes=[e.bounding_box() for e in page.locator('.onboarding-status button').all()]
   check(len(boxes)==4 and abs(boxes[0]['y']-boxes[1]['y'])<2 and boxes[2]['y']>boxes[0]['y'] and abs(boxes[2]['y']-boxes[3]['y'])<2,'four choices in 2x2')
   for el in page.locator('.onboarding-mobile-page button').all():
    if el.is_visible():
     box=el.bounding_box();check(box['width']>=43.5 and box['height']>=43.5,'44px target')
     check(el.evaluate('(e)=>e.scrollWidth<=e.clientWidth+1'),'no clipped button label')
   cdp=ctx.new_cdp_session(page);nodes=cdp.send('Accessibility.getFullAXTree')['nodes'];cdp.detach()
   check(all(n.get('name',{}).get('value','').strip() for n in nodes if not n.get('ignored') and n.get('role',{}).get('value') in ['button','progressbar']),'AX controls named')
  page.goto(URL);page.locator('.dashboard-mobile').wait_for();before=snapshot();start();initial=title()
  check(page.locator('.onboarding-progress').inner_text().startswith('0 de 26 revisadas'),'18 previous statuses protected, 26 editable')
  check('UTN-ISI23-10' in page.locator('.onboarding-code').inner_text(),'source catalog order skips protected codes')
  check(page.locator('.onboarding-choice[aria-pressed=true]').count()==0,'unreviewed not selected Pendiente')
  for status in ['Aprobada','Regularizada','Cursando','Pendiente']:
   choose(status);page.get_by_role('button',name='Anterior',exact=True).click()
   check(title()==initial,'back same card');check(page.get_by_role('button',name=status,exact=True).get_attribute('aria-pressed')=='true','clear current '+status)
   check(len(next(iter(snapshot()['sessions'].values()))['draft']['decisions'])==1,'correction not another review')
  check('1 de 26 revisadas' in page.locator('.onboarding-progress').inner_text(),'explicit Pendiente counted as reviewed')
  check(snapshot()['state']['records']['demo-instance-user:instances:demo-sistemas']['status']['UTN-ISI23-10']=='Pendiente','shared committed map updated')
  # Next on a reviewed card preserves it; omit next without assigning any state.
  page.get_by_role('button',name='Siguiente',exact=True).click();omitted=page.locator('.onboarding-code').inner_text();page.get_by_role('button',name='Omitir',exact=True).click();after=snapshot()
  check(omitted not in after['state']['records']['demo-instance-user:instances:demo-sistemas']['status'],'omission no write')
  check('1 omitidas' in page.locator('.onboarding-progress').inner_text(),'omission shown')
  resume=title();page.get_by_role('button',name='Pausar y volver a Inicio',exact=False).click();page.locator('.dashboard-mobile').wait_for()
  check(sum(int(v) for v in page.locator('.dashboard-state strong').all_text_contents())==44,'dashboard coherent after choices')
  start();check(title()==resume,'resume cursor from Home');page.reload();page.locator('#onboarding-subject-title').wait_for();check(title()==resume,'reload retains cursor')
  check('1 de 26 revisadas' in page.locator('.onboarding-progress').inner_text(),'reload review count')
  page.go_back();page.go_forward();page.locator('#onboarding-subject-title').wait_for();check(title()==resume,'browser Back/Forward retains cursor')
  # Editing from detail preserves filters; old card session cannot overwrite it.
  tab('Materias');page.get_by_role('searchbox').fill('UTN-ISI23-10');page.locator('.subject-result-row').first.click();page.locator('.status-actions button').filter(has_text='Aprobada').click();page.locator('.subject-detail-panel [data-academic-phase=success]').wait_for();page.get_by_role('button',name='Cerrar',exact=True).click();tab('Inicio');start()
  check('19 con estado previo protegido' in page.locator('.onboarding-progress').inner_text(),'external detail decision becomes protected on resume')
  # Per-plan sessions and records remain separate.
  career('utn-industrial-2023');tab('Inicio');start();check('0 de ' in page.locator('.onboarding-progress').inner_text(),'independent new context')
  choose('Cursando');industrial=title();career('utn-sistemas-2023');tab('Inicio');start();check(title()!=industrial,'no foreign card carried to Systems')
  career('utn-industrial-2023');tab('Inicio');start();check(title()==industrial,'resume another career')
  page.reload();page.locator('#onboarding-subject-title').wait_for();check(title()==industrial,'persist both careers')
  # Error and conflict leave records and cursor unchanged, explicit refresh required.
  for mode in ['error','conflict']:
   simulation(mode);prior=title();records=snapshot()['state']['records'];page.get_by_role('button',name='Aprobada',exact=True).click();page.locator(f'.onboarding-mobile-page [data-academic-phase={mode}]').wait_for()
   check(title()==prior and snapshot()['state']['records']==records,mode+' unchanged')
   check(page.get_by_role('button',name='Aprobada',exact=True).is_disabled(),mode+' no automatic retry')
   page.get_by_role('button',name='Actualizar datos ficticios',exact=True).click();page.locator('.onboarding-mobile-page [data-academic-phase=success]').wait_for();check(page.get_by_role('button',name='Aprobada',exact=True).is_enabled(),'refresh unlocks same card')
  # Delayed success does not advance early; context invalidation prevents A→B→A leakage.
  simulation('success','4000');records=snapshot()['state']['records'];prior=title();page.get_by_role('button',name='Aprobada',exact=True).click();check(title()==prior,'no optimistic advance');check(page.get_by_role('button',name='Omitir',exact=True).is_disabled(),'busy prevents duplicate navigation')
  career('utn-sistemas-2023');career('utn-industrial-2023');tab('Inicio');start();page.wait_for_timeout(4200)
  check(snapshot()['state']['records']==records,'late response never applied after context change');check(title()==prior,'late response never advances old cursor')
  simulation('success');ctx.set_offline(True);choose('Regularizada');check(title()!=prior,'offline after load card operation');ctx.set_offline(False)
  # End without reviewing all, corrections and fully protected states.
  scenario('instances');start()
  for _ in range(26):page.get_by_role('button',name='Omitir',exact=True).click()
  check(page.get_by_role('heading',name='Llegaste al final del recorrido').is_visible(),'end card summary');check('0 revisadas y 26 sin revisar' in page.locator('.onboarding-summary').inner_text(),'all omitted remain unreviewed')
  page.get_by_role('button',name='Terminar por ahora',exact=True).click();page.get_by_role('heading',name='Tu punto de partida está listo').wait_for();page.get_by_role('button',name='Volver a las tarjetas',exact=True).click();check(title()==initial,'can correct completed partial run')
  scenario('missing-progress');scenario('instances');start()
  # Responsive: short landscape, tiny viewport, enlarged text, keyboard and AX.
  for w,h in [(320,568),(375,667),(390,844),(430,932),(844,390),(1280,800),(320,340)]:
   page.set_viewport_size({'width':w,'height':h})
   for scale in ['100%','200%']:
    page.evaluate('(v)=>document.documentElement.style.fontSize=v',scale);audit()
    page.get_by_role('button',name='Pendiente',exact=True).focus();page.keyboard.press('Tab');check(page.get_by_role('button',name='Cursando',exact=True).evaluate('(e)=>e===document.activeElement'),'keyboard status order')
  page.evaluate("document.documentElement.style.fontSize=''");page.set_viewport_size({'width':390,'height':844});page.evaluate('scrollTo(0,0)');page.screenshot(path=str(OUT/'onboarding-390.png'))
  page.locator('.onboarding-status').scroll_into_view_if_needed();page.screenshot(path=str(OUT/'onboarding-states-390.png'))
  contrast=page.evaluate("""()=>{const rgb=s=>s.match(/[\\d.]+/g).map(Number);const lum=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);return [...document.querySelectorAll('.onboarding-choice,.onboarding-progress p,.onboarding-heading p,.onboarding-code,.onboarding-level')].map(e=>{let n=e,bg=[255,255,255];while(n){const c=rgb(getComputedStyle(n).backgroundColor);if(c.length===3||c[3]===1){bg=c;break}n=n.parentElement}const l=[lum(rgb(getComputedStyle(e).color)),lum(bg)].sort((a,b)=>b-a);return (l[0]+.05)/(l[1]+.05)})}""")
  check(min(contrast)>=4.5,'sampled new text contrast >=4.5:1')
  # No-career/invalid/missing catalog states do not offer the writable flow.
  for name in ['empty','unselected','frozen','blocked','invalid-progress','unavailable']:
   scenario(name);check(page.locator('.onboarding-entry-mobile').count()==0,'no writable entry '+name)
   tab('Materias');check(page.locator('.onboarding-choice').count()==0,'no context data '+name)
  scenario('legacy');start();check('demo-legacy-user' in next(iter(snapshot()['sessions'])),'legacy scope distinct');check(page.locator('.onboarding-progress').inner_text().startswith('0 de 26 revisadas'),'legacy baseline retained')
  # Storage failures and invalid snapshots fail visibly without writes or reset to Pending.
  bad=ctx.new_page();bad.add_init_script("localStorage.setItem('correlativas-demo-235-academic-v1','invalid')");bad.goto(URL);bad.get_by_role('heading',name='Progreso no disponible',exact=True).wait_for();check(bad.locator('.demo-storage-warning').is_visible(),'invalid storage visible');check(bad.evaluate('(k)=>localStorage.getItem(k)',KEY)=='invalid','invalid snapshot not overwritten');bad.close()
  denied=ctx.new_page();denied.add_init_script("Storage.prototype.getItem=()=>{throw Error('blocked')};Storage.prototype.setItem=()=>{throw Error('blocked')}");denied.goto(URL);denied.locator('.demo-storage-warning').wait_for();denied.get_by_role('button',name='Configurar mis materias',exact=False).click();denied.get_by_role('button',name='Cursando',exact=True).click();denied.locator('[data-academic-phase=success]').wait_for();check(True,'blocked storage still works in memory');denied.close()
  check(not errors,'no JavaScript errors '+str(errors));check(not events,'no popups/downloads')
  check(all(r.startswith(URL) or r.startswith('data:') for r in requests),'no external requests')
  check(not page.evaluate('__sensitiveCalls.length'),'no permission or network APIs')
  check(not page.locator('iframe,link[rel=manifest],a[download],input#grade').count(),'no installation or notes')
  headers=urllib.request.urlopen(URL).headers;check("connect-src 'none'" in headers.get('Content-Security-Policy',''),'restrictive served CSP')
  result={'checks':checks,'javascriptErrors':errors,'externalRequests':[],'unexpectedEvents':events,'accessibility':'Chromium AX names, keyboard, 44px targets, 2x2, 200% root text; physical Safari/VoiceOver pending','minimumSampledContrast':min(contrast),'offlineAfterLoad':True,'physicalSafariTested':False}
  (OUT/'onboarding.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2));b.close()
finally:server.terminate();server.wait(timeout=10)
