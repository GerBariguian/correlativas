"""New 2.4.2 flow/gesture tests in mobile Chromium profiles, never physical certification."""
from pathlib import Path
import subprocess,time,urllib.request,json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'.tools/mobile-242-hold150-flow';OUT.mkdir(parents=True,exist_ok=True)
URL='http://127.0.0.1:5216/';KEY='correlativas-demo-235-academic-v1';checks=[];errors=[];external=[];events=[]
server=subprocess.Popen(['node','node_modules/vite/bin/vite.js','preview','--config','mobile/career-onboarding/vite.config.mjs','--port','5216','--strictPort'],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
def check(ok,label):
 assert ok,label
 checks.append(label)
try:
 for _ in range(100):
  try:urllib.request.urlopen(URL);break
  except OSError:time.sleep(.05)
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-background-networking'])
  for profile,w,h,ua in [
   ('Android',412,915,'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36'),
   ('iPhone-profile',390,844,'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')]:
   c=browser.new_context(viewport={'width':w,'height':h},is_mobile=True,has_touch=True,user_agent=ua,reduced_motion='reduce')
   c.add_init_script("""window.__sensitiveCalls=[];for(const [o,k] of [[window,'fetch'],[window,'open'],[window,'WebSocket'],[window.XMLHttpRequest?.prototype,'open'],[navigator,'sendBeacon'],[navigator.geolocation,'getCurrentPosition'],[navigator.mediaDevices,'getUserMedia'],[window.Notification,'requestPermission'],[navigator.serviceWorker,'register']])if(o&&o[k])o[k]=()=>{__sensitiveCalls.push(k);throw Error('Unexpected API '+k)};window.addEventListener('securitypolicyviolation',e=>__sensitiveCalls.push('CSP '+e.blockedURI));""")
   pg=c.new_page();pg.on('pageerror',lambda e:errors.append(str(e)));pg.on('request',lambda r:external.append(r.url) if not r.url.startswith(URL) else None);pg.on('popup',lambda _:events.append('popup'));pg.on('download',lambda _:events.append('download'))
   pg.goto(URL);pg.locator('.bottom-nav').wait_for()
   def snapshot():return pg.evaluate('(k)=>JSON.parse(localStorage.getItem(k))',KEY)
   def tab(label):pg.locator('.bottom-nav button').filter(has_text=label).click();pg.wait_for_timeout(80)
   def careers():pg.get_by_role('button',name='Cambiar contexto académico').click();pg.wait_for_timeout(100)
   def scenario(name):
    pg.get_by_role('button',name='Abrir Cuenta de Alex, perfil ficticio').click();pg.locator('.context-scenarios summary').click();pg.locator('#demo-scenario').select_option(name);pg.wait_for_timeout(100);tab('Inicio')
   def add(uni,career,plan=None):
    careers();pg.locator('.career-manager>button').click();pg.locator('.wizard-options button').filter(has_text=uni).click();pg.locator('.wizard-options button').filter(has_text=career).click()
    if plan:pg.get_by_role('radio',name='Plan '+plan,exact=True).check()
    pg.get_by_role('button',name='Agregar carrera',exact=True).click();pg.locator('.career-added').wait_for()
   def config():pg.get_by_role('button',name='Configurar mis materias',exact=True).click();pg.locator('.onboarding-mobile-page').wait_for()
   def session():return next(iter(snapshot()['sessions'].values()))
   def active_session():
    data=snapshot();return next(s for s in data['sessions'].values() if s['draft']['scope']['id']==data['state']['profile']['activeCareerInstanceId'])
   def audit_new_ui(selector):
    check(pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),profile+': new flow no horizontal overflow')
    for el in pg.locator(selector+' button').all():
     if el.is_visible():
      r=el.bounding_box();check(r['width']>=44 and r['height']>=44,profile+': new flow 44px action')
    d=c.new_cdp_session(pg);nodes=d.send('Accessibility.getFullAXTree')['nodes'];d.detach()
    controls=[n for n in nodes if not n.get('ignored') and n.get('role',{}).get('value') in ['button','searchbox','combobox']]
    check(bool(controls) and all(n.get('name',{}).get('value','').strip() for n in controls),profile+': new flow AX names')

   def title():return pg.locator('#onboarding-subject-title').inner_text()
   def sw(dx,dy=0,edge=False,outside=False,cancel=False,revert=False,anchor=None):
    el=pg.locator(anchor or '.onboarding-subject h2');el.scroll_into_view_if_needed();box=el.bounding_box();x=box['x']+box['width']/2;y=box['y']+box['height']/2
    if edge:
     el.dispatch_event('pointerdown',{'pointerId':501,'pointerType':'touch','button':0,'isPrimary':True,'clientX':10,'clientY':y})
     el.dispatch_event('pointerup',{'pointerId':501,'pointerType':'touch','button':0,'isPrimary':True,'clientX':160,'clientY':y});return
    d=c.new_cdp_session(pg)
    d.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
    if not outside:pg.wait_for_timeout(230);check(pg.locator('.onboarding-subject').get_attribute('data-gesture-armed')=='true',profile+': hold arms full card')
    for i in range(1,11):
     d.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x+dx*i/10,'y':y+dy*i/10}]});pg.wait_for_timeout(20)
    if revert:d.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x,'y':y}]});pg.wait_for_timeout(30)
    preview=pg.locator('[data-gesture-status]').get_attribute('data-gesture-status') if pg.locator('[data-gesture-status]').count() else None
    if preview:check(preview==('Aprobada' if dx>0 else 'Pendiente') if abs(dx)>abs(dy) else preview==('Cursando' if dy<0 else 'Regularizada'),profile+': live state preview')
    if preview:
     bg=pg.locator('[data-gesture-status]').evaluate('(e)=>getComputedStyle(e).backgroundColor')
     expected={'Pendiente':'rgb(237, 240, 245)','Aprobada':'rgb(227, 245, 236)','Cursando':'rgb(254, 243, 199)','Regularizada':'rgb(219, 234, 254)'}
     check(bg==expected[preview],profile+': correct academic preview color')
     pg.screenshot(path=str(OUT/(profile+'-preview-'+preview+'.png')))

    d.send('Input.dispatchTouchEvent',{'type':'touchCancel' if cancel else 'touchEnd','touchPoints':[]});d.detach();pg.wait_for_timeout(700 if outside else 150)
   # First trajectory, optional confirmation, duplicate/reload does not add again.
   scenario('empty');add('UTN','Sistemas')
   check(snapshot()['state']['profile']['activeCareerInstanceId']=='demo-added-1',profile+': first selected by existing rule')
   pg.screenshot(path=str(OUT/(profile+'-career-added.png')),full_page=True)
   check(not snapshot()['sessions'],profile+': no compulsory onboarding')
   for width,height in [(320,568),(915,412)]:
    pg.set_viewport_size({'width':width,'height':height});pg.evaluate("document.documentElement.style.fontSize='200%'");pg.wait_for_timeout(100);audit_new_ui('.career-added')
   pg.set_viewport_size({'width':w,'height':h});pg.evaluate("document.documentElement.style.fontSize='100%'")

   pg.get_by_role('button',name='Hacerlo después',exact=True).click();check(pg.locator('.career-tile').count()==1,profile+': later shows careers')
   pg.get_by_role('button',name='Configurar mis materias',exact=True).click();pg.locator('.onboarding-subject').wait_for();first=title();initial=snapshot()['state']['records']
   sw(-140,outside=True);check(title()==first and snapshot()['state']['records']==initial,profile+': immediate drag without hold never assigns a state')
   sw(-20);check(title()==first and snapshot()['state']['records']==initial,profile+': short gesture ignored')
   sw(-100,100);check(title()==first and snapshot()['state']['records']==initial,profile+': diagonal does not decide')
   pg.evaluate('window.scrollTo(0,0)');pg.wait_for_timeout(100);scroll_before=pg.evaluate('scrollY')
   sw(0,-120,outside=True);check(pg.evaluate('scrollY')>scroll_before,profile+': normal vertical scroll remains functional');check(title()==first and snapshot()['state']['records']==initial,profile+': vertical page scroll outside gesture zone does not decide')
   sw(140,edge=True);check(title()==first,profile+': browser edge left alone')
   sw(-140,revert=True);check(title()==first and snapshot()['state']['records']==initial,profile+': returning drag to origin does not decide')
   sw(-140,cancel=True);check(title()==first and snapshot()['state']['records']==initial,profile+': pointer cancellation does not decide')
   check(pg.locator('[data-gesture-status]').count()==0,profile+': preview cleared on cancel')
   zone=pg.locator('.onboarding-subject');zone.scroll_into_view_if_needed();bounds=zone.bounding_box();x=bounds['x']+bounds['width']/2;y=bounds['y']+bounds['height']/2
   d=c.new_cdp_session(pg);one={'id':31,'x':x,'y':y};two={'id':32,'x':x+30,'y':y+10}
   d.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[one]});pg.wait_for_timeout(230);d.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[one,two]})
   d.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{**one,'x':x-100},{**two,'x':x-70}]});d.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});d.detach();pg.wait_for_timeout(150)
   check(title()==first and snapshot()['state']['records']==initial,profile+': second pointer cancels academic decision')
   pg.get_by_role('button',name='Omitir',exact=True).click();check(title()!=first,profile+': independent omission button')
   check(snapshot()['state']['records']==initial and session()['skipped'] and not session()['draft']['decisions'],profile+': Omitir is not Pendiente')
   pg.get_by_role('button',name='Anterior',exact=True).click();check(title()==first,profile+': independent previous button')
   for (dx,dy,status),anchor in zip([(-140,0,'Pendiente'),(140,0,'Aprobada'),(0,-110,'Cursando'),(0,110,'Regularizada')],['.onboarding-subject h2','.onboarding-code','.onboarding-level','.academic-gesture-guide']):
    sw(dx,dy,anchor=anchor);pg.locator('.onboarding-mobile-page [data-academic-phase=success]').wait_for();check(title()!=first,profile+': academic swipe advances '+status)
    pg.get_by_role('button',name='Anterior',exact=True).click();check(title()==first,profile+': can return and correct gesture')
    check(pg.get_by_role('button',name=status,exact=True).get_attribute('aria-pressed')=='true',profile+': gesture saved '+status)
    check(len(session()['draft']['decisions'])==1,profile+': swipe corrections affect only this card')
    if status in ['Cursando','Regularizada']:
     expected='rgb(254, 243, 199)' if status=='Cursando' else 'rgb(219, 234, 254)'
     check(pg.get_by_role('button',name=status,exact=True).evaluate('(e)=>getComputedStyle(e).backgroundColor')==expected,profile+': state button palette')
     check(pg.locator('.onboarding-subject .demo-status').evaluate('(e)=>getComputedStyle(e).backgroundColor')==expected,profile+': card badge palette')

   for status in ['Pendiente','Cursando','Regularizada','Aprobada']:
    pg.get_by_role('button',name=status,exact=True).click();pg.locator('.onboarding-mobile-page [data-academic-phase=success]').wait_for()
    check(title()!=first,profile+': status advances '+status)
    pg.get_by_role('button',name='Anterior',exact=True).click();check(title()==first,profile+': correction same card')
    check(pg.get_by_role('button',name=status,exact=True).get_attribute('aria-pressed')=='true',profile+': choice remains selected')
    check(len(session()['draft']['decisions'])==1,profile+': correction not another write')
   check(pg.locator('.swipe-card').evaluate('(e)=>getComputedStyle(e).animationName')=='none',profile+': reduced motion disables entry animation')
   pg.get_by_role('button',name='Pausar y volver a Inicio',exact=False).click();tab('Materias');check(pg.locator('.subject-result-row .demo-status').first.inner_text()=='Aprobada',profile+': shared list updated')
   tab('Inicio');config();check(title()==first,profile+': resume Home')
   pg.reload();pg.locator('.onboarding-subject').wait_for();check(title()==first,profile+': reload restores cursor')
   careers();pg.get_by_role('button',name='Retomar carga de materias',exact=True).click();pg.locator('.onboarding-subject').wait_for();check(title()==first,profile+': resume My careers')
   # Keyboard alternatives: no arrow-key interception; native buttons remain available.
   before=session()['cursor'];pg.get_by_role('button',name='Siguiente',exact=True).focus();pg.keyboard.press('Enter');check(session()['cursor']==before+1,profile+': keyboard next');pg.get_by_role('button',name='Anterior',exact=True).focus();pg.keyboard.press('Space');check(session()['cursor']==before,profile+': keyboard previous')
   # Additional career: explicit confirmation and cancellation, original records preserved.
   original=snapshot()['state']['records'];add('UBA','Actuario');check(snapshot()['state']['profile']['activeCareerInstanceId']=='demo-added-1',profile+': additional not selected')
   pg.get_by_role('button',name='Configurar mis materias',exact=True).click();pg.get_by_role('dialog').wait_for();pg.screenshot(path=str(OUT/(profile+'-confirm-context.png')));audit_new_ui('[role=dialog]');check('cambiar' in pg.get_by_role('dialog').inner_text(),profile+': context switch explained')
   for width,height in [(320,340),(915,412)]:
    pg.set_viewport_size({'width':width,'height':height});pg.evaluate("document.documentElement.style.fontSize='200%'");pg.wait_for_timeout(100);audit_new_ui('[role=dialog]')
    panel=pg.locator('.demo-sheet');r=panel.bounding_box();check(r['y']>=-1 and r['y']+r['height']<=height+1,profile+': context dialog fits short large-text viewport')
   pg.set_viewport_size({'width':w,'height':h});pg.evaluate("document.documentElement.style.fontSize='100%'")
   pg.go_back();pg.get_by_role('dialog').wait_for(state='hidden');check(snapshot()['state']['profile']['activeCareerInstanceId']=='demo-added-1',profile+': Back cancels switch')
   pg.go_forward();pg.get_by_role('dialog').wait_for();pg.get_by_role('button',name='Cancelar',exact=True).click();pg.get_by_role('dialog').wait_for(state='hidden')
   pg.get_by_role('button',name='Configurar mis materias',exact=True).click();pg.get_by_role('button',name='Cambiar y configurar',exact=True).click();pg.locator('.onboarding-subject').wait_for()
   check(snapshot()['state']['profile']['activeCareerInstanceId']=='demo-added-2',profile+': confirmed target selected')
   check(snapshot()['state']['records']==original,profile+': selection does not transfer records')
   check(active_session()['draft']['scope']['catalogId']=='uba-actuario',profile+': new session belongs to requested catalog')
   target_code=pg.locator('.onboarding-code').inner_text();pg.get_by_role('button',name='Cursando',exact=True).click();pg.locator('.onboarding-mobile-page [data-academic-phase=success]').wait_for()
   records=snapshot()['state']['records'];own_key='demo-instance-user:instances:demo-added-2'
   check(records[own_key]['status'][target_code]=='Cursando',profile+': second career stores own choice')
   check({k:v for k,v in records.items() if k!=own_key}==original,profile+': second choice preserves every original record')
   careers();pg.locator('.career-tile[data-catalog="utn-sistemas-2023"]').get_by_role('button',name='Configurar mis materias',exact=True).click();pg.get_by_role('button',name='Cambiar y configurar',exact=True).click();pg.locator('.onboarding-subject').wait_for()
   check(title()==first and pg.get_by_role('button',name='Aprobada',exact=True).get_attribute('aria-pressed')=='true',profile+': returning resumes original career and choice')
   check(snapshot()['state']['records'][own_key]==records[own_key],profile+': leaving preserves second career')

   # All-preconfigured progress must not create editable cards or overwrite states.
   scenario('instances');tab('Materias');codes=pg.locator('.subject-result-row').evaluate_all('(els)=>els.map(e=>e.dataset.subjectCode)')
   data=snapshot();key='demo-instance-user:instances:demo-sistemas';data['state']['records'][key]={'status':{code:'Aprobada' for code in codes}};data['sessions']={}
   pg.evaluate('([k,v])=>localStorage.setItem(k,JSON.stringify(v))',[KEY,data]);pg.reload();tab('Inicio');config()
   check(pg.locator('.onboarding-subject').count()==0,profile+': fully recorded has no editable cards');check('protegidos' in pg.locator('.onboarding-summary').inner_text(),profile+': protected empty message')
   check(snapshot()['state']['records']==data['state']['records'],profile+': no previous status overwritten')
   # Archived trajectories require explicit restoration; restoring never selects.
   scenario('instances');careers();pg.locator('.archived-careers summary').click();arch=pg.locator('.career-tile[data-catalog="utn-industrial-2007"]')
   check(arch.get_by_role('button',name='Configurar mis materias',exact=True).count()==0,profile+': archived cannot configure')
   arch.get_by_role('button',name='Restaurar',exact=True).click();pg.wait_for_timeout(100);check(snapshot()['state']['profile']['activeCareerInstanceId']=='demo-sistemas',profile+': restore not selected')
   arch.get_by_role('button',name='Configurar mis materias',exact=True).click();pg.get_by_role('button',name='Cancelar',exact=True).click();check(snapshot()['state']['profile']['activeCareerInstanceId']=='demo-sistemas',profile+': restore configure still asks')
   # First confirmation may configure immediately; no second context confirmation.
   scenario('empty');add('UTN','Sistemas');pg.get_by_role('button',name='Configurar mis materias',exact=True).click();pg.locator('.onboarding-subject').wait_for()
   check(pg.get_by_role('dialog').count()==0,profile+': first primary starts directly')
   # An account without a selection still requires an explicit selection.
   scenario('unselected');careers();pg.locator('.career-tile[data-catalog="utn-sistemas-2023"]').get_by_role('button',name='Configurar mis materias',exact=True).click()
   check(snapshot()['state']['profile']['activeCareerInstanceId'] is None,profile+': no-selection is preserved until confirmation')
   pg.get_by_role('button',name='Cambiar y configurar',exact=True).click();pg.locator('.onboarding-subject').wait_for()
   check(snapshot()['state']['profile']['activeCareerInstanceId']=='demo-sistemas',profile+': explicit selection from no context')
   # Legacy uses its existing context, never creates a trajectory or migrates.
   scenario('legacy');careers();pg.get_by_role('button',name='Configurar mis materias',exact=True).click();pg.locator('.onboarding-subject').wait_for()
   check(snapshot()['state']['control'] is None and not snapshot()['state']['instances'],profile+': legacy onboarding remains legacy')
   # Existing baseline is protected; errors/conflicts do not advance or commit.
   for mode in ['error','conflict']:
    scenario('instances');pg.get_by_role('button',name='Abrir Cuenta de Alex, perfil ficticio').click();pg.locator('.context-scenarios summary').click();pg.locator('#academic-result').select_option(mode);tab('Inicio');config()
    name=title();before=snapshot();sw(0,-110);pg.locator(f'.onboarding-mobile-page [data-academic-phase={mode}]').wait_for()
    check(title()==name and snapshot()['state']['records']==before['state']['records'],profile+': '+mode+' no write or advance')
   # Late response must be discarded by the existing context controller.
   scenario('instances');pg.get_by_role('button',name='Abrir Cuenta de Alex, perfil ficticio').click();pg.locator('.context-scenarios summary').click();pg.locator('#academic-delay').select_option('4000');tab('Inicio');config()
   before=snapshot()['state']['records'];cursor=session()['cursor'];sw(0,-110);check(pg.locator('.onboarding-subject').get_attribute('data-gesture-enabled')=='false',profile+': pending disables gesture surface');check(session()['cursor']==cursor,profile+': pending blocks swipe')
   careers();pg.locator('.career-tile[data-catalog="utn-industrial-2023"]').get_by_role('button',name='Configurar mis materias',exact=True).click();pg.get_by_role('button',name='Cambiar y configurar',exact=True).click();pg.locator('.onboarding-subject').wait_for();pg.wait_for_timeout(4200)
   check(snapshot()['state']['records']==before,profile+': late result cannot write after context switch')
   check(snapshot()['state']['profile']['activeCareerInstanceId']=='demo-industrial23',profile+': pending target correct')
   # Touch layout, animation opt-in, small landscape and large text.
   pg.emulate_media(reduced_motion='no-preference');pg.get_by_role('button',name='Omitir',exact=True).click()
   check(pg.locator('.swipe-card').evaluate('(e)=>getComputedStyle(e).animationName') in ['card-enter','card-enter-previous'],profile+': normal motion animation')
   pg.emulate_media(reduced_motion='reduce')
   for width,height in [(320,568),(390,844),(412,915),(915,412)]:
    pg.set_viewport_size({'width':width,'height':height})
    for scale in ['100%','200%']:
     pg.evaluate('(s)=>document.documentElement.style.fontSize=s',scale);pg.wait_for_timeout(100)
     check(pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),profile+': responsive no overflow')
     check(pg.locator('.bottom-nav button').count()==6,profile+': six destinations')
     for el in pg.locator('.onboarding-mobile-page button').all():
      if el.is_visible():
       r=el.bounding_box();check(r['width']>=44 and r['height']>=44,profile+': 44px onboarding buttons')
   pg.screenshot(path=str(OUT/(profile+'-onboarding.png')),full_page=True)
   check(not pg.evaluate('window.__sensitiveCalls'),profile+': no sensitive API calls');c.close()
  browser.close()
 check(not errors,'no JavaScript errors');check(not external,'no external requests');check(not events,'no downloads/popups')
 report={'passed':len(checks),'checks':checks,'javascriptErrors':errors,'externalRequests':external,'unexpectedEvents':events,'engine':'Chromium Linux with Android and iPhone UA/viewport/touch profiles, not Safari','physicalAndroidTested':False,'physicalSafariTested':False,'VoiceOverTalkBackTested':False}
 (OUT/'result.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k!='checks'},indent=2))
except Exception as e:
 (OUT/'failed.json').write_text(json.dumps({'error':str(e),'passed':len(checks),'errors':errors,'external':external},indent=2)+'\n');raise
finally:server.terminate();server.wait()
