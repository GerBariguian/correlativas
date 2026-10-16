"""Chromium web compatibility checks, not device or Safari certification."""
from pathlib import Path
import json,subprocess,time,urllib.request,tempfile
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'.tools/mobile-241-checks';OUT.mkdir(parents=True,exist_ok=True)
URL='http://127.0.0.1:5212/';KEY='correlativas-demo-235-academic-v1'
checks=[];errors=[];external=[];sensitive=[];cases=[]
def check(ok,label):
    assert ok,label
    checks.append(label)
server=subprocess.Popen(['node','node_modules/vite/bin/vite.js','preview','--config','mobile/responsive-parity/vite.config.mjs','--port','5212','--strictPort'],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
    for _ in range(100):
        try: response=urllib.request.urlopen(URL);break
        except OSError:time.sleep(.05)
    expected=dict(line.strip().split(': ',1) for line in (ROOT/'mobile/safari-demo-site/_headers').read_text().splitlines() if line.startswith('  '))
    for key,value in expected.items():check(response.headers.get(key)==value,'header: '+key)
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-background-networking'])
        def context(w,h,profile=None):
            options=dict(viewport={'width':w,'height':h},is_mobile=True,has_touch=True,reduced_motion='reduce')
            c=p.chromium.launch_persistent_context(profile,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-background-networking'],**options) if profile else browser.new_context(**options)
            c.add_init_script("""window.__calls=[];for(const [obj,key] of [[window,'open'],[window,'fetch'],[window,'WebSocket'],[window,'EventSource'],[navigator,'sendBeacon'],[window.XMLHttpRequest?.prototype,'open'],[navigator.geolocation,'getCurrentPosition'],[navigator.mediaDevices,'getUserMedia'],[window.Notification,'requestPermission'],[navigator.serviceWorker,'register']])if(obj&&obj[key])obj[key]=function(){__calls.push(key);throw Error('Unexpected API: '+key)};window.addEventListener('securitypolicyviolation',e=>__calls.push('CSP: '+e.blockedURI));""")
            return c
        def page(c):
            pg=c.new_page();pg.on('pageerror',lambda e:errors.append(str(e)))
            pg.on('request',lambda r:external.append(r.url) if not r.url.startswith(URL) else None)
            pg.on('popup',lambda _:sensitive.append('popup'));pg.on('download',lambda _:sensitive.append('download'))
            pg.goto(URL);pg.locator('.bottom-nav').wait_for();return pg
        def tab(pg,name):
            pg.locator('.bottom-nav button').filter(has_text=name).click();pg.wait_for_timeout(80)
        def audit(pg,label):
            check(pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),label+': no document overflow')
            nav=pg.locator('.bottom-nav');box=nav.bounding_box()
            check(nav.locator('button').all_text_contents()==['Inicio','Materias','Mapa','Planificar','Proyectar','Comunidad'],label+': six tabs')
            check(pg.evaluate("getComputedStyle(document.querySelector('.demo-intro')).display==='none'"),label+': phone UI')
            check(box['y']>=0 and box['y']+box['height']<=pg.viewport_size['height']+1,label+': bar within viewport')
            for button in nav.locator('button').all():
                b=button.bounding_box();check(b['width']>=44 and b['height']>=44,label+': 44px nav target')
                check(b['x']>=-1 and b['x']+b['width']<=pg.viewport_size['width']+1,label+': nav target not clipped')
            reserve=pg.locator('.mobile-content').evaluate('(e)=>parseFloat(getComputedStyle(e).paddingBottom)')
            check(reserve>=box['height']+20,label+': bar height reserved')
            nav.locator('button').first.focus();pg.keyboard.press('Tab');check(pg.evaluate('getComputedStyle(document.activeElement).outlineStyle')!='none',label+': keyboard focus visible')
            # Exposed names checked through Chromium AX tree, not an axe audit.
            cdp=pg.context.new_cdp_session(pg);nodes=cdp.send('Accessibility.getFullAXTree')['nodes'];cdp.detach()
            controls=[n for n in nodes if not n.get('ignored') and n.get('role',{}).get('value') in ['button','textbox','searchbox','combobox']]
            check(bool(controls) and all(n.get('name',{}).get('value','').strip() for n in controls),label+': accessible control names')
        matrix=[(320,568),(360,800),(390,844),(412,915),(430,932),(768,1024),(844,390),(915,412),(1024,600)]
        for w,h in matrix:
            c=context(w,h);pg=page(c)
            for scale in [100,200]:
                pg.evaluate('(n)=>document.documentElement.style.fontSize=n+"%"',scale);pg.wait_for_timeout(100)
                for section in ['Inicio','Materias','Mapa','Planificar','Proyectar','Comunidad']:
                    tab(pg,section);audit(pg,f'{w}x{h}/{scale}/{section}')
                tab(pg,'Materias');pg.locator('.subject-result-row').first.click();pg.locator('.subject-detail-panel').wait_for()
                for full in [False,True]:
                    if full:pg.get_by_role('button',name='Ampliar panel',exact=True).click()
                    panel=pg.locator('.subject-detail-panel');b=panel.bounding_box()
                    check(b['y']>=-1 and b['y']+b['height']<=h+1,f'{w}/{scale}/detail bounds {full}')
                    pg.get_by_role('button',name='Cerrar',exact=True).focus()
                    check(pg.get_by_role('button',name='Cerrar',exact=True).evaluate('(e)=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight}'),f'{w}/{scale}/detail close visible {full}')
                    for el in pg.locator('.status-actions button').all():
                        el.scroll_into_view_if_needed();r=el.bounding_box();check(r['width']>=44 and r['height']>=44,f'{w}/{scale}/status targets')
                pg.keyboard.press('Escape');pg.locator('.subject-detail-panel').wait_for(state='hidden')
                pg.screenshot(path=str(OUT/f'{w}-{h}-{scale}.png'))
                cases.append({'width':w,'height':h,'rootTextPercent':scale})
            sensitive.extend(pg.evaluate('window.__calls'));c.close()
        # Rotation and keyboard-like resize (does not open an actual OS keyboard).
        c=context(412,915);pg=page(c);tab(pg,'Materias')
        search=pg.get_by_role('searchbox',name='Buscar materia');search.fill('algebra');search.focus()
        for w,h in [(915,412),(412,915),(412,300),(412,915)]:
            pg.set_viewport_size({'width':w,'height':h});pg.wait_for_timeout(100)
            check(search.input_value()=='algebra','rotation/short viewport preserves query')
            audit(pg,f'resize {w}x{h}')
        search.fill('');pg.get_by_role('button',name='Abrir filtros avanzados',exact=False).click();pg.locator('.subject-filter-form').wait_for()
        pg.set_viewport_size({'width':412,'height':300});pg.wait_for_timeout(100)
        check(pg.locator('.demo-sheet').evaluate('(e)=>{const r=e.getBoundingClientRect();return r.top>=-1&&r.bottom<=innerHeight+1}'),'short viewport dialog fits')
        pg.get_by_role('button',name='Cancelar',exact=True).click();pg.locator('.demo-sheet').wait_for(state='hidden');pg.set_viewport_size({'width':412,'height':915})
        tab(pg,'Mapa');m=pg.locator('.career-map');m.hover();before=m.evaluate('(e)=>e.scrollLeft');pg.mouse.wheel(430,0);pg.wait_for_timeout(400)
        check(m.evaluate('(e)=>e.scrollLeft')>before,'map horizontal scroll remains independent')
        check(pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'map does not widen document')
        tab(pg,'Materias');pg.get_by_role('searchbox').fill('algebra');pg.locator('.subject-result-row').first.click();pg.locator('.subject-detail-panel').wait_for()
        pg.go_back();pg.locator('.subject-detail-panel').wait_for(state='hidden');check(pg.get_by_role('searchbox').input_value()=='algebra','Back retains filters')
        pg.go_forward();pg.locator('.subject-detail-panel').wait_for();pg.keyboard.press('Escape');pg.locator('.subject-detail-panel').wait_for(state='hidden')
        # Onboarding decisions and an actual Chromium process/profile close/reopen.
        c.close();profile=tempfile.mkdtemp(prefix='browser-profile-',dir=OUT)
        c=context(412,915,profile);pg=page(c)
        pg.get_by_role('button',name='Abrir Cuenta de Alex, perfil ficticio').click();pg.locator('.context-scenarios summary').click();pg.locator('#demo-scenario').select_option('missing-progress')
        tab(pg,'Inicio');pg.get_by_role('button',name='Configurar mis materias',exact=False).click();pg.locator('.onboarding-subject').wait_for()
        original=pg.locator('#onboarding-subject-title').inner_text()
        pg.locator('.onboarding-choice').filter(has_text='Cursando').click();pg.locator('.onboarding-mobile-page [data-academic-phase=success]').wait_for()
        pg.get_by_role('button',name='Omitir',exact=True).click()
        pg.get_by_role('button',name='Anterior',exact=True).click();pg.get_by_role('button',name='Anterior',exact=True).click();check(pg.locator('#onboarding-subject-title').inner_text()==original,'onboarding previous retains card')
        pg.get_by_role('button',name='Pausar y volver a Inicio',exact=False).click()
        saved=pg.evaluate('(k)=>localStorage.getItem(k)',KEY);check(bool(saved),'confirmed demo progress persisted')
        pg.close();c.close()
        # Close and restart the browser process with the same disk profile.
        c=context(412,915,profile);pg=page(c)
        restored=json.loads(pg.evaluate('(k)=>localStorage.getItem(k)',KEY));prior=json.loads(saved)
        for key in ['records','instances','profile']:
            check(restored['state'][key]==prior['state'][key],'browser restart preserves '+key)
        for key,session in prior['sessions'].items():
            for field in ['cursor','skipped','complete']:
                check(restored['sessions'][key][field]==session[field],'browser restart preserves '+field)
            check(restored['sessions'][key]['draft']['decisions']==session['draft']['decisions'],'browser restart preserves decisions')
        pg.get_by_role('button',name='Configurar mis materias',exact=False).click();pg.locator('.onboarding-subject').wait_for()
        check(pg.locator('#onboarding-subject-title').inner_text()==original,'resume restores cursor')
        check(pg.locator('.onboarding-choice').filter(has_text='Cursando').get_attribute('aria-pressed')=='true','resume restores confirmed state')
        tab(pg,'Inicio');pg.get_by_role('button',name='Cambiar contexto académico').click()
        candidates=pg.locator('.career-tile:not(.is-selected)').get_by_role('button',name='Seleccionar',exact=True)
        check(candidates.count()>0,'second context available');candidates.first.click();tab(pg,'Inicio')
        check(pg.locator('.onboarding-mobile-page').count()==0,'changing context leaves onboarding')
        sensitive.extend(pg.evaluate('window.__calls||[]'));c.close()
        check(not errors,'no uncaught JavaScript errors');check(not external,'no external requests');check(not sensitive,'no sensitive APIs, CSP violations, downloads or popups')
        browser.close()
    report={'passed':len(checks),'matrix':cases,'errors':errors,'externalRequests':external,'sensitiveEvents':sensitive,'checks':checks,'engine':'system Chromium, mobile/touch emulation','actualKeyboardTested':False,'physicalAndroidTested':False,'physicalSafariTested':False,'voiceOverTalkBackTested':False}
    (OUT/'result.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k!='checks'},indent=2))
except Exception as e:
    (OUT/'failed.json').write_text(json.dumps({'error':str(e),'passed':len(checks),'errors':errors,'external':external},indent=2)+'\n');raise
finally:server.terminate();server.wait()
