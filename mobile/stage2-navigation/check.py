"""Navigation regression with the environment's existing Playwright/Chromium.
Run after building. No installation, external hosting, or backend is used.
"""
import json
import re
import subprocess
import time
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '.tools/mobile-navigation-checks'
OUT.mkdir(parents=True, exist_ok=True)
URL = 'http://127.0.0.1:5184/'
server = subprocess.Popen(['node', 'node_modules/vite/bin/vite.js', 'preview', '--config', 'mobile/stage2-navigation/vite.config.mjs', '--port', '5184'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
checks = 0

def check(condition, message):
    global checks
    assert condition, message
    checks += 1

try:
    for _ in range(100):
        try:
            urllib.request.urlopen(URL)
            break
        except OSError:
            time.sleep(.05)
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox', '--disable-background-networking'])
        context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, reduced_motion='reduce')
        page = context.new_page()
        requests, errors, downloads, popups = [], [], [], []
        page.on('request', lambda req: requests.append(req.url))
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('download', lambda obj: downloads.append(obj.suggested_filename))
        page.on('popup', lambda obj: popups.append(obj.url))

        def route(name):
            page.wait_for_url(URL + '#' + name)
            page.wait_for_timeout(100)
            check(page.evaluate('document.activeElement.id') == 'navigation-content' or page.locator('.demo-sheet').count() > 0, 'route focus or accessible modal')

        def tab(name):
            page.locator('.bottom-nav button').filter(has_text=name).click()

        page.goto(URL)
        route('inicio')
        check(page.locator('.bottom-nav button').all_text_contents() == ['Inicio', 'Materias', 'Mapa', 'Comunidad'], 'four approved primary destinations')
        check(page.locator('.navigation-back').count() == 0, 'no back on initial route')
        page.locator('.navigation-links button').filter(has_text='Planificar').click()
        route('planificador')
        check(page.locator('.bottom-nav [aria-current]').count() == 0, 'secondary route does not falsely select a primary tab')
        page.get_by_role('button', name='Proyectar Carrera', exact=True).click()
        route('proyeccion')
        check('Sólo navegación' in page.locator('main').inner_text(), 'projection is only a destination, not future implementation')
        page.get_by_role('button', name='Abrir Cuenta de Alex, perfil ficticio').click()
        route('cuenta')
        page.get_by_role('button', name=re.compile('^Mis carreras')).click()
        route('carreras')
        check('Contexto fijo de ejemplo' in page.locator('main').inner_text(), 'no stage 2.2 career management')
        page.get_by_role('button', name='Volver a la pantalla anterior').click()
        route('cuenta')
        page.go_back()
        route('proyeccion')
        page.go_forward()
        route('cuenta')
        tab('Materias')
        route('materias')
        page.locator('.demo-subject-row').first.click()
        page.locator('.demo-sheet').wait_for()
        page.locator('.subject-detail-button').click()
        page.locator('.subject-modal').wait_for()
        page.go_back()
        page.locator('.subject-modal').wait_for(state='hidden')
        check(page.locator('.demo-sheet').count() == 1, 'Back closes inner detail before subject panel')
        page.go_forward()
        page.locator('.subject-modal').wait_for()
        page.get_by_role('button', name='Cerrar detalle de materia').click()
        page.locator('.subject-modal').wait_for(state='hidden')
        page.keyboard.press('Escape')
        page.locator('.demo-sheet').wait_for(state='hidden')
        check(page.url.endswith('#materias'), 'Escape closes panel without leaving its page')
        page.go_forward()
        page.locator('.demo-sheet').wait_for()
        page.locator('.demo-sheet header button').click()
        page.locator('.demo-sheet').wait_for(state='hidden')
        page.evaluate('window.scrollTo(0, 600)')
        page.wait_for_timeout(100)
        before_scroll = page.evaluate('window.scrollY')
        tab('Inicio')
        route('inicio')
        page.go_back()
        route('materias')
        check(abs(page.evaluate('window.scrollY') - before_scroll) < 3, 'Back restores list scroll without focus jumping to top')
        page.locator('.notification-button').click()
        page.locator('.notification-item').first.click()
        page.locator('.group-title').wait_for()
        page.locator('.demo-sheet header button').click()
        page.locator('.demo-sheet').wait_for(state='hidden')
        route('comunidad')
        page.go_back()
        page.locator('.notification-item').first.wait_for()
        check('Tu actividad' in page.locator('.demo-sheet').inner_text(), 'history restores activity origin after destination closes')
        page.keyboard.press('Escape')
        page.locator('.demo-sheet').wait_for(state='hidden')

        # A direct route is reloadable, but panels/entities never restore from a
        # prior document session. Invalid destinations normalize to Inicio.
        page.goto(URL + '#cuenta')
        page.reload()
        route('cuenta')
        check(page.locator('.navigation-back').count() == 0, 'reload starts a new safe history session')
        page.goto(URL + '#unknown')
        route('inicio')
        page.locator('.notification-button').click()
        page.locator('.demo-sheet').wait_for()
        page.reload()
        route('inicio')
        check(page.locator('.demo-sheet').count() == 0, 'reload does not resurrect stale panel payloads')

        for width, height in [(320, 568), (390, 844), (430, 932), (844, 390), (1280, 900)]:
            page.set_viewport_size({'width': width, 'height': height})
            for name in ['inicio', 'cuenta', 'carreras', 'planificador', 'proyeccion', 'materias', 'mapa', 'comunidad']:
                page.goto(URL + '#' + name)
                route(name)
                check(page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), f'no document horizontal overflow: {name} {width}')
                check(page.locator('.bottom-nav button').count() == 4, f'primary navigation present: {name} {width}')
                if width == 390:
                    page.screenshot(path=str(OUT / f'{name}-390.png'), full_page=True)
                box = page.locator('.bottom-nav').bounding_box()
                check(box['y'] >= 0 and box['y'] + box['height'] <= height + 1, f'primary navigation in viewport: {name} {width}')
                check(all(b.bounding_box()['height'] >= 44 for b in page.locator('.bottom-nav button').all()), f'44px primary touch targets: {name} {width}')
            page.goto(URL + '#cuenta')
            route('cuenta')
            page.screenshot(path=str(OUT / f'cuenta-{width}.png'), full_page=True)

        page.set_viewport_size({'width': 320, 'height': 340})
        page.goto(URL + '#cuenta')
        route('cuenta')
        page.get_by_role('button', name=re.compile('^Mis carreras')).click()
        route('carreras')
        check(page.get_by_role('button', name='Volver a la pantalla anterior').is_visible(), 'back reachable in keyboard-sized viewport')
        page.keyboard.press('Tab')
        check(page.evaluate("document.activeElement.tagName === 'BUTTON'"), 'keyboard reaches an action after route focus')
        check(not [r for r in requests if not r.startswith(URL) and not r.startswith('data:')], 'zero external requests')
        check(errors == downloads == popups == [], 'zero JS errors, downloads or popups')
        check(page.locator('link[rel="manifest"],iframe,a[download]').count() == 0, 'no install mechanism or downloads')
        result = {'passed': True, 'checks': checks, 'widths': [320, 390, 430, 844, 1280], 'engine': 'Chromium (not Safari or native Android)', 'externalRequests': [], 'javascriptErrors': [], 'downloads': [], 'popups': []}
        (OUT / 'result.json').write_text(json.dumps(result, indent=2))
        print(json.dumps(result, indent=2))
        browser.close()
finally:
    server.terminate()
    server.wait(timeout=10)
