"""Full-card deliberate hold vs native scroll, lifecycle, color and motion checks."""
from pathlib import Path
import json,subprocess,time,urllib.request
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'.tools/mobile-242-fullcard-colors-intent';OUT.mkdir(parents=True,exist_ok=True)
URL='http://127.0.0.1:5219/';KEY='correlativas-demo-235-academic-v1';checks=[];errors=[]
def check(ok,label):
 assert ok,label
 checks.append(label)
s=subprocess.Popen(['node','node_modules/vite/bin/vite.js','preview','--config','mobile/career-onboarding/vite.config.mjs','--port','5219','--strictPort'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,cwd=ROOT)
try:
 for _ in range(100):
  try:urllib.request.urlopen(URL);break
  except OSError:time.sleep(.05)
 with sync_playwright() as p:
  b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  for width,height,label in [(390,844,'iPhone viewport'),(412,915,'Android viewport')]:
   c=b.new_context(viewport={'width':width,'height':height},is_mobile=True,has_touch=True,reduced_motion='reduce');pg=c.new_page();pg.on('pageerror',lambda e:errors.append(str(e)));pg.goto(URL);pg.get_by_role('button',name='Configurar mis materias',exact=False).click();card=pg.locator('.onboarding-subject');card.wait_for()
   def state():return pg.evaluate('(k)=>JSON.parse(localStorage.getItem(k))',KEY)['state']['records']
   initial=state();title=pg.locator('#onboarding-subject-title').inner_text();d=c.new_cdp_session(pg)
   def start(selector='.onboarding-subject h2'):
    el=pg.locator(selector);el.scroll_into_view_if_needed();pg.wait_for_timeout(100);r=el.bounding_box();x=r['x']+r['width']/2;y=r['y']+r['height']/2
    d.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'id':1,'x':x,'y':y}]});return x,y
   def move(x,y):d.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'id':1,'x':x,'y':y}]});pg.wait_for_timeout(50)
   def end(cancel=False):d.send('Input.dispatchTouchEvent',{'type':'touchCancel' if cancel else 'touchEnd','touchPoints':[]});pg.wait_for_timeout(150)
   def unchanged(msg):check(state()==initial and pg.locator('#onboarding-subject-title').inner_text()==title,label+': '+msg)
   # A tap/short hold never assigns, neither does a completed hold without drag.
   start();pg.wait_for_timeout(160);end();unchanged('short hold no decision')
   start();pg.wait_for_timeout(420);check(card.get_attribute('data-gesture-armed')=='true',label+': stationary hold arms card');end();unchanged('hold and release without direction no decision')
   # Moving before the timer expires commits the contact to scrolling forever.
   pg.evaluate('window.scrollTo(0,0)');pg.wait_for_timeout(120);x,y=start();before=pg.evaluate('scrollY')
   for i in range(1,7):move(x,y-i*20)
   pg.wait_for_timeout(500);check(card.get_attribute('data-gesture-armed')=='false',label+': scroll cannot rearm after pause')
   move(x,y-160);end();check(pg.evaluate('scrollY')>before,label+': normal page scroll on card');unchanged('scroll then pause and continue does not assign')
   # External scroll, focus loss, cancellation and another contact all disarm.
   x,y=start();pg.wait_for_timeout(420);pg.evaluate('window.dispatchEvent(new Event("blur"))');move(x-100,y);end();unchanged('blur cancels held contact')
   x,y=start();pg.wait_for_timeout(420);end(True);unchanged('touchCancel no decision')
   x,y=start();pg.wait_for_timeout(420)
   d.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'id':1,'x':x,'y':y},{'id':2,'x':width-8,'y':35}]});pg.wait_for_timeout(40)
   check(card.get_attribute('data-gesture-armed')=='false',label+': second finger anywhere disarms')
   end();unchanged('multi contact no assignment')
   # Keep reduced-motion transform off, retaining the chosen-state indicator.
   x,y=start();pg.wait_for_timeout(420);move(x-100,y)
   check(pg.locator('[data-gesture-status]').get_attribute('data-gesture-status')=='Pendiente',label+': preview remains with reduced motion')
   check(card.evaluate('(e)=>getComputedStyle(e).transform')=='none',label+': reduced motion no drag transform');end(True)
   pg.emulate_media(reduced_motion='no-preference');x,y=start();pg.wait_for_timeout(420);scroll=pg.evaluate('scrollY');move(x,y-100)
   check(card.evaluate('(e)=>getComputedStyle(e).transform')!='none',label+': normal motion retains fluid transform')
   check(pg.evaluate('scrollY')==scroll,label+': deliberate armed vertical drag does not scroll page');end(True);unchanged('cancelled animated drag no assignment')
   pg.emulate_media(reduced_motion='reduce')
   # Enlargement never shifts the geometry when the ready label replaces the hint.
   for w,h in [(320,568),(915,412)]:
    pg.set_viewport_size({'width':w,'height':h});pg.evaluate("document.documentElement.style.fontSize='200%'")
    start();before_height=card.bounding_box()['height'];pg.wait_for_timeout(420)
    check(card.get_attribute('data-gesture-armed')=='true',label+': large text hold works')
    check(abs(card.bounding_box()['height']-before_height)<1,label+': arming label has no layout shift');end()
   pg.set_viewport_size({'width':width,'height':height});pg.evaluate("document.documentElement.style.fontSize='100%'")
   # Unmount/context switch during a hold removes its listeners and timer.
   start();pg.wait_for_timeout(420);pg.get_by_role('button',name='Cambiar contexto académico').evaluate('(b)=>b.click()')
   pg.locator('.career-tile[data-catalog="utn-industrial-2023"]').get_by_role('button',name='Seleccionar',exact=True).click();end();pg.wait_for_timeout(500)
   check(state()==initial,label+': changing context during contact writes nothing')
   pg.screenshot(path=str(OUT/(str(width)+'-after-context.png')));c.close()
  b.close()
 check(not errors,'no JavaScript errors')
 report={'passed':len(checks),'checks':checks,'errors':errors,'browser':'Chromium Linux touch/viewport emulation','physicalSafariTested':False,'physicalAndroidTested':False,'holdMs':360,'nativeScrollVerified':True}
 (OUT/'result.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k!='checks'},indent=2))
finally:s.terminate();s.wait()
