"""UX-only regression: title outside border, equal 2x2 controls, sticky header."""
from pathlib import Path
import json,subprocess,time,urllib.request
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'.tools/mobile-integration-checks'
URL='http://127.0.0.1:5200/'
server=subprocess.Popen(['node','node_modules/vite/bin/vite.js','preview','--config','mobile/integration-final/vite.config.mjs','--port','5200','--strictPort'],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
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
  page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(URL);page.locator('.bottom-nav button').filter(has_text='Materias').click();page.locator('.subject-result-row').first.click();page.locator('.subject-detail-panel').wait_for()
  for w,h in [(320,568),(375,667),(390,844),(430,932),(844,390),(1280,800),(320,340)]:
   page.set_viewport_size({'width':w,'height':h})
   for scale in ['100%','200%']:
    page.evaluate('(scale)=>document.documentElement.style.fontSize=scale',scale)
    for full in [False,True]:
     if full:page.get_by_role('button',name='Ampliar panel').click()
     page.locator('.detail-status-section').scroll_into_view_if_needed();page.wait_for_timeout(60)
     data=page.evaluate("""()=>{const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right}};const panel=document.querySelector('.subject-detail-panel');return {title:box(document.querySelector('#detail-status-title')),field:box(document.querySelector('.detail-status-editor')),buttons:[...document.querySelectorAll('.status-actions button')].map(box),pressed:document.querySelectorAll('.status-actions [aria-pressed=true]').length,overflow:panel.scrollWidth>panel.clientWidth+1}}""")
     a,c=data['buttons'][:2];d,e=data['buttons'][2:]
     check(len(data['buttons'])==4,'four controls present')
     check(data['title']['bottom']+7<=data['field']['y'],'title sits above border')
     check(abs(a['y']-c['y'])<1 and abs(d['y']-e['y'])<1 and d['y']>=a['bottom']+9,'two rows with separation')
     check(abs(a['x']-d['x'])<1 and abs(c['x']-e['x'])<1 and c['x']>=a['right']+9,'two aligned columns')
     check(max(x['width'] for x in data['buttons'])-min(x['width'] for x in data['buttons'])<1,'equal button widths')
     check(max(x['height'] for x in data['buttons'])-min(x['height'] for x in data['buttons'])<1,'equal button heights')
     check(all(x['height']>=52 and x['width']>=44 for x in data['buttons']),'touch dimensions')
     check(data['pressed']==1,'one selected state')
     check(not data['overflow'],'no clipping horizontally')
     for pos in [0,.5,1]:
      page.locator('.subject-detail-panel').evaluate('(el,f)=>el.scrollTop=f*(el.scrollHeight-el.clientHeight)',pos);page.wait_for_timeout(30)
      header=page.evaluate("""()=>{const p=document.querySelector('.subject-detail-panel').getBoundingClientRect(),b=document.querySelector('.subject-detail-panel button[aria-label=\\"Cerrar\\"]').getBoundingClientRect();const hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return {inside:b.top>=p.top&&b.bottom<=p.bottom,uncovered:Boolean(hit?.closest('button[aria-label=\\"Cerrar\\"]'))}}""")
      check(header['inside'] and header['uncovered'],'close control visible and uncovered throughout scroll')
     if full:page.get_by_role('button',name='Reducir panel').click()
  page.evaluate("document.documentElement.style.fontSize=''");page.set_viewport_size({'width':390,'height':844})
  page.locator('.detail-status-section').evaluate("e=>e.scrollIntoView({block:'center'})");page.wait_for_timeout(100)
  page.screenshot(path=str(OUT/'status-ux-390.png'))
  cdp=ctx.new_cdp_session(page);nodes=cdp.send('Accessibility.getFullAXTree')['nodes'];cdp.detach()
  check(any(not n.get('ignored') and n.get('role',{}).get('value')=='group' and n.get('name',{}).get('value')=='Tu estado académico' for n in nodes),'fieldset remains named without overlapping legend')
  for state in ['Pendiente','Cursando','Regularizada','Aprobada']:
   page.locator('.status-actions button').filter(has_text=state).click();page.locator('.subject-detail-panel [data-academic-phase=success]').wait_for()
   check(page.locator('.status-actions [aria-pressed=true]').inner_text()==state,'selection updates '+state)
  check(not errors,'no JS errors')
  result={'checks':checks,'errors':errors,'viewports':7,'textScales':['100%','200%'],'modes':['panel','expanded'],'physicalSafariTested':False}
  (OUT/'status-layout.json').write_text(json.dumps(result,indent=2));print(json.dumps(result));b.close()
finally:server.terminate();server.wait(timeout=10)
