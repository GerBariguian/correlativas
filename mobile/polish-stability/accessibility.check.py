"""Keyboard, focus, live-region and history checks; not a screen-reader certification."""
from pathlib import Path
import subprocess,time,urllib.request,json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'.tools/mobile-243-polish-stability-accessibility';OUT.mkdir(parents=True,exist_ok=True)
URL='http://127.0.0.1:5222/';KEY='correlativas-demo-235-academic-v1';checks=[];errors=[];external=[]
def check(ok,label):
 assert ok,label
 checks.append(label)
s=subprocess.Popen(['node','node_modules/vite/bin/vite.js','preview','--config','mobile/polish-stability/vite.config.mjs','--port','5222','--strictPort'],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
 for _ in range(100):
  try:urllib.request.urlopen(URL);break
  except OSError:time.sleep(.05)
 with sync_playwright() as p:
  b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  for w,h in [(390,844),(412,915)]:
   c=b.new_context(viewport={'width':w,'height':h},is_mobile=True,has_touch=True,reduced_motion='reduce');pg=c.new_page();pg.on('pageerror',lambda e:errors.append(str(e)));pg.on('request',lambda r:external.append(r.url) if not r.url.startswith(URL) else None)
   pg.goto(URL);pg.get_by_role('button',name='Configurar mis materias',exact=False).click();pg.wait_for_timeout(120)
   def focused():return pg.evaluate('document.activeElement.id')
   def stored():return pg.evaluate('(k)=>JSON.parse(localStorage.getItem(k))',KEY)
   def title():return pg.locator('#onboarding-subject-title').inner_text()
   check(focused()=='onboarding-subject-title',f'{w}: entering focuses card heading, not main')
   check(pg.locator('#onboarding-subject-title').get_attribute('aria-describedby')=='onboarding-card-position onboarding-code onboarding-current-status','heading describes position code and status')
   check(pg.locator('.academic-a11y-live').get_attribute('aria-atomic')=='true','persistent atomic polite status')
   check(pg.locator('.academic-a11y-live').evaluate('(e)=>getComputedStyle(e).display')!='none','empty live region remains exposed')
   # Every state can be selected with keyboard; no touch or swipe required.
   for status in ['Pendiente','Cursando','Regularizada','Aprobada']:
    name=title();button=pg.get_by_role('button',name=status,exact=True);button.focus();pg.keyboard.press('Tab');pg.keyboard.press('Shift+Tab')
    check(button.evaluate('(e)=>e===document.activeElement'),'keyboard order returns to '+status)
    check(button.evaluate('(e)=>getComputedStyle(e).outlineStyle')=='solid','visible keyboard focus '+status)
    pg.keyboard.press('Enter');pg.wait_for_timeout(500)
    check(pg.locator('.academic-a11y-live').inner_text()==f'{name}: {status} confirmado.','confirmed named decision '+status)
    check(focused()=='onboarding-subject-title','next card receives focus '+status)
   records=stored()['state']['records'];current=title()
   pg.get_by_role('button',name='Omitir',exact=True).focus();pg.keyboard.press('Space');pg.wait_for_timeout(100)
   check(stored()['state']['records']==records,'keyboard Omitir never writes Pendiente')
   pg.get_by_role('button',name='Anterior',exact=True).focus();pg.keyboard.press('Enter');pg.wait_for_timeout(100)
   check(title()==current,'keyboard Anterior restores previous card')
   pg.get_by_role('button',name='Pausar y volver a Inicio',exact=True).focus();pg.keyboard.press('Enter');pg.wait_for_timeout(100)
   pg.get_by_role('button',name='Configurar mis materias',exact=False).click();pg.wait_for_timeout(100)
   check(title()==current and focused()=='onboarding-subject-title','resume retains cursor and focuses title')
   pg.go_back();pg.wait_for_timeout(100);pg.go_forward();pg.wait_for_timeout(100)
   check(title()==current and stored()['state']['records']==records,'history Back Forward preserves records and cursor')
   check(focused()=='onboarding-subject-title','history return focuses card title')
   pg.reload();pg.locator('#onboarding-subject-title').wait_for();pg.wait_for_timeout(150)
   check(title()==current and stored()['state']['records']==records,'reload preserves confirmed decisions and cursor')
   check(focused()=='onboarding-subject-title','reload focuses card title')
   check(pg.locator('.swipe-card').evaluate('(e)=>getComputedStyle(e).animationName')=='none','reduced motion disables card animation')
   # Inspect exposed Chromium accessibility names, not simulated VoiceOver speech.
   d=c.new_cdp_session(pg);ax=d.send('Accessibility.getFullAXTree')['nodes']
   for status in ['Pendiente','Cursando','Regularizada','Aprobada']:
    check(any(not n.get('ignored') and n.get('role',{}).get('value')=='button' and n.get('name',{}).get('value')==status for n in ax),'AX exposes state button '+status)
   for width,height in [(320,568),(390,844),(412,915),(915,412)]:
    pg.set_viewport_size({'width':width,'height':height});pg.evaluate("document.documentElement.style.fontSize='200%'");pg.wait_for_timeout(100)
    check(pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),f'{width}: no horizontal page overflow at 200%')
    for status in ['Pendiente','Cursando','Regularizada','Aprobada']:
     button=pg.get_by_role('button',name=status,exact=True);button.scroll_into_view_if_needed();r=button.bounding_box()
     check(r['width']>=44 and r['height']>=44,f'{width}: touch target '+status)
   pg.evaluate("document.documentElement.style.fontSize='100%'");pg.set_viewport_size({'width':w,'height':h})
   # Failed/conflicting saves must not announce a confirmed state.
   for mode in ['error','conflict']:
    pg.get_by_role('button',name='Abrir Cuenta de Alex, perfil ficticio').click();pg.locator('.context-scenarios summary').click();pg.locator('#academic-result').select_option(mode)
    pg.locator('.bottom-nav').get_by_role('button',name='Inicio',exact=True).click();pg.get_by_role('button',name='Configurar mis materias',exact=False).click();old=title();prior=stored()['state']['records']
    pg.get_by_role('button',name='Aprobada',exact=True).focus();pg.keyboard.press('Enter');pg.locator(f'.onboarding-mobile-page [data-academic-phase={mode}]').wait_for();pg.wait_for_timeout(100)
    check(title()==old and stored()['state']['records']==prior,'failed save preserves record and card '+mode)
    check(pg.locator('.academic-a11y-live').inner_text()=='','no false confirmation announcement '+mode)
    check(pg.locator(f'.onboarding-mobile-page [data-academic-phase={mode}]').get_attribute('role')=='alert','failure exposed as alert '+mode)
    pg.get_by_role('button',name='Actualizar datos ficticios',exact=True).click();pg.locator('.onboarding-mobile-page [data-academic-phase=success]').wait_for()
   # All six tabs remain named, with one current destination. Dialog has Escape and focus restoration.
   for name in ['Inicio','Materias','Mapa','Planificar','Proyectar','Comunidad']:
    pg.locator('.bottom-nav').get_by_role('button',name=name,exact=True).click();pg.wait_for_timeout(100)
    check(pg.locator('.bottom-nav button[aria-current=page]').count()==1,'current tab '+name)
   pg.get_by_role('button',name='Notificaciones, 3 sin leer',exact=True).click();pg.get_by_role('dialog').wait_for();pg.keyboard.press('Escape');pg.wait_for_timeout(150)
   check(pg.get_by_role('dialog').count()==0,'Escape closes notifications dialog')
   check(pg.evaluate('document.activeElement.getAttribute("aria-label")')=='Notificaciones, 3 sin leer','dialog returns focus to trigger')
   pg.get_by_role('button',name='Notificaciones, 3 sin leer',exact=True).click();pg.get_by_role('dialog').wait_for();pg.go_back();pg.wait_for_timeout(150)
   check(pg.get_by_role('dialog').count()==0,'browser Back closes dialog')
   check(pg.evaluate('document.activeElement.getAttribute("aria-label")')=='Notificaciones, 3 sin leer','browser Back restores dialog trigger')
   pg.go_forward();pg.get_by_role('dialog').wait_for();pg.keyboard.press('Escape');pg.wait_for_timeout(150)
   check(pg.get_by_role('dialog').count()==0,'browser Forward restored panel remains closable')
   pg.screenshot(path=str(OUT/f'{w}-community.png'));c.close()
  b.close()
 check(not errors,'no JavaScript errors');check(not external,'no external requests')
 report={'passed':len(checks),'checks':checks,'javascriptErrors':errors,'externalRequests':external,'engine':'Chromium Linux keyboard, AX tree and mobile viewport; not VoiceOver/TalkBack','physicalDevicesTested':False}
 (OUT/'result.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k!='checks'},indent=2))
finally:s.terminate();s.wait()
