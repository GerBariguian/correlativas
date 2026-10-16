"""Compare the approved and responsive UI at unchanged portrait widths."""
from pathlib import Path
import subprocess,time,urllib.request,json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'.tools/mobile-241-visual';OUT.mkdir(exist_ok=True)
servers=[];results=[]
try:
 for port,target in [(5213,'mobile-240-reproduction/dist'),(5214,'mobile-241/dist')]:
  servers.append(subprocess.Popen(['node','node_modules/vite/bin/vite.js','preview','--config','mobile/integration-final/vite.config.mjs','--outDir','../../.tools/'+target,'--port',str(port),'--strictPort'],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL))
  for _ in range(100):
   try:urllib.request.urlopen(f'http://127.0.0.1:{port}/');break
   except OSError:time.sleep(.05)
 with sync_playwright() as p:
  b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  for w,h in [(360,800),(390,844),(430,932)]:
   contexts=[b.new_context(viewport={'width':w,'height':h},is_mobile=True,has_touch=True,reduced_motion='reduce') for _ in range(2)]
   pages=[c.new_page() for c in contexts]
   for pg,port in zip(pages,[5213,5214]):pg.goto(f'http://127.0.0.1:{port}/');pg.locator('.bottom-nav').wait_for()
   for section in ['Inicio','Materias','Mapa','Planificar','Proyectar','Comunidad']:
    captures=[]
    for pg,suffix in zip(pages,['approved','responsive']):
     pg.locator('.bottom-nav button').filter(has_text=section).click();pg.wait_for_timeout(150)
     captures.append(pg.screenshot(path=str(OUT/f'{w}-{section}-{suffix}.png')))
    results.append({'width':w,'height':h,'section':section,'viewportPixelsIdentical':captures[0]==captures[1]})
   for c in contexts:c.close()
  b.close()
 (OUT/'result.json').write_text(json.dumps(results,indent=2)+'\n')
 assert all(r['viewportPixelsIdentical'] for r in results),[r for r in results if not r['viewportPixelsIdentical']]
 print(f'{len(results)} portrait viewport screenshots are byte-identical to approved base.')
finally:
 for server in servers:server.terminate();server.wait()
