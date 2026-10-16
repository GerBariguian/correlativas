"""Supplemental touch, form/short viewport, lifecycle and offline checks."""
from pathlib import Path
import subprocess,time,urllib.request,json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'.tools/mobile-241-interaction';OUT.mkdir(exist_ok=True)
URL='http://127.0.0.1:5215/';checks=0

def check(ok,label):
 global checks
 assert ok,label
 checks+=1
server=subprocess.Popen(['node','node_modules/vite/bin/vite.js','preview','--config','mobile/responsive-parity/vite.config.mjs','--port','5215','--strictPort'],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
 for _ in range(100):
  try:urllib.request.urlopen(URL);break
  except OSError:time.sleep(.05)
 with sync_playwright() as p:
  b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  c=b.new_context(viewport={'width':412,'height':915},is_mobile=True,has_touch=True,reduced_motion='reduce');pg=c.new_page();errors=[]
  pg.on('pageerror',lambda e:errors.append(str(e)));pg.goto(URL);pg.locator('.bottom-nav').wait_for()
  def tab(name):pg.locator('.bottom-nav button').filter(has_text=name).click();pg.wait_for_timeout(100)
  tab('Mapa');m=pg.locator('.career-map');m.scroll_into_view_if_needed();m.evaluate('(e)=>e.scrollLeft=0');r=m.bounding_box()
  d=c.new_cdp_session(pg);x=r['x']+r['width']-35;y=max(r['y']+20,20)
  d.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
  for i in range(1,13):
   d.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x-i*20,'y':y}]});pg.wait_for_timeout(20)
  d.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});pg.wait_for_timeout(400)
  check(m.evaluate('(e)=>e.scrollLeft>0'),'emulated finger drag scrolls map')
  check(pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'touch scroll stays in map');d.detach()
  pg.get_by_role('button',name='Abrir Cuenta de Alex, perfil ficticio').click();pg.locator('.context-scenarios summary').click();pg.locator('#demo-scenario').select_option('empty')
  pg.get_by_role('button',name='Cambiar contexto académico').click();pg.get_by_role('button',name='Agregar mi primera carrera',exact=True).click();pg.locator('.career-wizard').wait_for()
  q=pg.get_by_role('searchbox',name='Buscar universidad')
  for w,h in [(320,340),(390,300),(412,300),(915,412)]:
   pg.set_viewport_size({'width':w,'height':h})
   for font in ['100%','200%']:
    pg.evaluate('(f)=>document.documentElement.style.fontSize=f',font);q.fill('UTN');q.focus();pg.wait_for_timeout(100)
    check(q.input_value()=='UTN','query preserved across short viewports')
    check(q.evaluate('(e)=>parseFloat(getComputedStyle(e).fontSize)>=16'),'input at least 16px, no Safari focus zoom trigger')
    check(pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'wizard no horizontal document overflow')
    check(pg.locator('.bottom-nav').count()==0,'wizard hides bar as approved')
    for name in ['Atrás','Cancelar']:
     el=pg.get_by_role('button',name=name,exact=True);el.scroll_into_view_if_needed();r=el.bounding_box();check(r['height']>=44 and r['width']>=44,'wizard control touch size')
  pg.get_by_role('button',name='Cancelar',exact=True).click();pg.locator('.bottom-nav').wait_for();check(pg.locator('.career-tile').count()==0,'cancel adds no career')
  pg.set_viewport_size({'width':412,'height':915});pg.evaluate("document.documentElement.style.fontSize='100%'")
  pg.get_by_role('button',name='Abrir Cuenta de Alex, perfil ficticio').click();pg.locator('.context-scenarios summary').click();pg.locator('#demo-scenario').select_option('instances')
  c.set_offline(True);tab('Materias');pg.locator('.subject-result-row').first.click();pg.locator('.status-actions button').filter(has_text='Cursando').click();pg.locator('.subject-detail-panel [data-academic-phase=success]').wait_for()
  check(pg.locator('.subject-detail-panel .status').inner_text()=='Cursando','already loaded demo edits offline')
  pg.get_by_role('button',name='Cerrar',exact=True).click();tab('Inicio');check(pg.locator('.dashboard-mobile').count()==1,'dashboard works offline after load')
  check(not errors,'no JavaScript errors');b.close()
 (OUT/'result.json').write_text(json.dumps({'passed':checks,'errors':errors,'touch':'CDP touch event emulation, not real hardware','keyboard':'short viewport only, not actual OS keyboard','safeAreaInsets':'CSS retained; CDP override unavailable; physical verification pending','offline':'after load only; no offline cold-start support'},indent=2)+'\n')
 print(f'{checks} supplemental interaction checks passed')
finally:server.terminate();server.wait()
