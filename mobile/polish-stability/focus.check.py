"""Real emulated touch vs keyboard focus styling, without changing DOM focus."""
from pathlib import Path
import subprocess,time,urllib.request,json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'.tools/mobile-243-focus-modality-focus';OUT.mkdir(parents=True,exist_ok=True)
URL='http://127.0.0.1:5223/';checks=[];errors=[]
def check(ok,label):
 assert ok,label
 checks.append(label)
s=subprocess.Popen(['node','node_modules/vite/bin/vite.js','preview','--config','mobile/polish-stability/vite.config.mjs','--port','5223','--strictPort'],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
 for _ in range(100):
  try:urllib.request.urlopen(URL);break
  except OSError:time.sleep(.05)
 with sync_playwright() as p:
  b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  for w,h in [(390,844),(412,915)]:
   c=b.new_context(viewport={'width':w,'height':h},is_mobile=True,has_touch=True,reduced_motion='reduce');pg=c.new_page();pg.on('pageerror',lambda e:errors.append(str(e)));pg.goto(URL)
   pg.get_by_role('button',name='Configurar mis materias',exact=False).tap();pg.wait_for_timeout(150)
   heading=pg.locator('#onboarding-subject-title')
   def mode():return pg.evaluate('document.documentElement.dataset.demoInput')
   def focused():return heading.evaluate('(e)=>e===document.activeElement')
   def outline():return heading.evaluate('(e)=>getComputedStyle(e).outlineStyle')
   check(mode()=='pointer' and focused() and outline()=='none',f'{w}: touch entry preserves focus without outline')
   pg.reload();pg.locator('#onboarding-subject-title').wait_for();pg.wait_for_timeout(150)
   check(focused() and outline()=='none','reload retains programmatic focus without presuming keyboard input')
   # Even after keyboard activity, touching must reset the visual modality.
   for status in ['Pendiente','Cursando','Regularizada','Aprobada']:
    pg.keyboard.press('Tab');pg.keyboard.press('Shift+Tab');heading.focus()
    check(mode()=='keyboard' and outline()=='solid','keyboard heading indicator '+status)
    old=heading.inner_text();pg.get_by_role('button',name=status,exact=True).tap();pg.wait_for_timeout(500)
    check(mode()=='pointer' and focused() and outline()=='none','touch button advances without focus ring '+status)
    check(pg.locator('.academic-a11y-live').inner_text()==f'{old}: {status} confirmado.','touch confirmation remains accessible '+status)
   d=c.new_cdp_session(pg)
   for status,dx,dy in [('Pendiente',-100,0),('Aprobada',100,0),('Cursando',0,-100),('Regularizada',0,100)]:
    heading.scroll_into_view_if_needed();pg.wait_for_timeout(100);r=heading.bounding_box();x=r['x']+r['width']/2;y=r['y']+r['height']/2;old=heading.inner_text()
    d.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'id':1,'x':x,'y':y}]});pg.wait_for_timeout(230)
    check(pg.locator('.swipe-card').get_attribute('data-gesture-armed')=='true','150ms hold still arms '+status)
    d.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'id':1,'x':x+dx,'y':y+dy}]});pg.wait_for_timeout(50)
    check(pg.locator('[data-gesture-status]').get_attribute('data-gesture-status')==status,'gesture mapping unchanged '+status)
    d.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});pg.wait_for_timeout(500)
    check(focused() and outline()=='none','gesture advances focused heading without ring '+status)
    check(pg.locator('.academic-a11y-live').inner_text()==f'{old}: {status} confirmado.','gesture announcement retained '+status)
   pg.screenshot(path=str(OUT/f'{w}-touch.png'))
   pg.keyboard.press('Tab');pg.keyboard.press('Shift+Tab');heading.focus()
   check(mode()=='keyboard' and outline()=='solid','Tab restores visible heading focus')
   for action in ['Omitir','Anterior']:
    button=pg.get_by_role('button',name=action,exact=True);button.focus();check(button.evaluate('(e)=>getComputedStyle(e).outlineStyle')=='solid','keyboard button visible '+action);pg.keyboard.press('Enter');pg.wait_for_timeout(100)
    check(focused() and outline()=='solid','keyboard advance preserves visible focus '+action)
   pg.screenshot(path=str(OUT/f'{w}-keyboard.png'))
   # Programmatic focus itself never decides the input mode or writes data.
   before=pg.evaluate('localStorage.getItem("correlativas-demo-235-academic-v1")');heading.evaluate('(e)=>e.blur()');heading.focus()
   check(mode()=='keyboard' and pg.evaluate('localStorage.getItem("correlativas-demo-235-academic-v1")')==before,'programmatic focus does not alter modality or data')
   c.close()
  b.close()
 check(not errors,'no JavaScript errors')
 report={'passed':len(checks),'checks':checks,'errors':errors,'physicalSafariTested':False,'physicalAndroidTested':False,'VoiceOverTalkBackTested':False,'engine':'Chromium Linux real CDP touch dispatch + keyboard, not physical certification'}
 (OUT/'result.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k!='checks'},indent=2))
finally:s.terminate();s.wait()
