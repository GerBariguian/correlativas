"""Uses the environment's preinstalled Playwright and Chromium; installs nothing."""
import json
import subprocess
import time
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
ORIGIN = "http://127.0.0.1:5183"
server = subprocess.Popen(["python", str(ROOT / "mobile/safari-demo/serve.py")], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(100):
        try:
            response = urllib.request.urlopen(ORIGIN)
            break
        except OSError:
            time.sleep(.05)
    headers = json.loads((ROOT / "mobile/safari-demo/security-headers.json").read_text())
    for name, value in headers.items():
        assert response.headers[name] == value, name
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/chromium", args=["--no-sandbox", "--disable-background-networking"])
        context = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, accept_downloads=False)
        page = context.new_page()
        requests, downloads, popups, errors, dialogs = [], [], [], [], []
        page.on("request", lambda req: requests.append(req.url))
        page.on("download", lambda obj: downloads.append(obj.suggested_filename))
        page.on("popup", lambda obj: popups.append(obj.url))
        page.on("pageerror", lambda obj: errors.append(str(obj)))
        page.on("dialog", lambda obj: (dialogs.append(obj.type), obj.dismiss()))
        page.add_init_script("""window.permissionCalls=[];
          const block=(obj,key)=>{if(obj&&typeof obj[key]==='function')Object.defineProperty(obj,key,{value:()=>{permissionCalls.push(key);throw Error('Permission API used')}})};
          block(navigator.geolocation,'getCurrentPosition');block(navigator.geolocation,'watchPosition');
          block(navigator.mediaDevices,'getUserMedia');block(navigator.mediaDevices,'getDisplayMedia');
          block(window.Notification,'requestPermission');block(navigator.serviceWorker,'register');
          block(navigator.credentials,'create');block(navigator.credentials,'get');
          block(navigator.clipboard,'read');block(navigator.clipboard,'readText');
        """)
        page.goto(ORIGIN)
        page.locator('.journey-card').wait_for()
        for label in ["Materias", "Mapa", "Comunidad", "Inicio"]:
            page.locator('.bottom-nav button').filter(has_text=label).click()
        assert page.evaluate("window.permissionCalls") == []
        assert page.locator('link[rel="manifest"],a[download],iframe,object,embed,meta[http-equiv="refresh"]').count() == 0
        assert page.evaluate("!window.Capacitor && !document.documentElement.classList.contains('android-demo')")
        assert page.evaluate("document.querySelectorAll('script:not([src])').length===0")
        assert page.url == ORIGIN + '/'
        assert context.service_workers == []
        # Negative CSP checks: inline JavaScript and even data: fetch must fail.
        page.evaluate("const s=document.createElement('script');s.textContent='window.inlineProbe=true';document.body.append(s)")
        assert page.evaluate("window.inlineProbe === undefined")
        assert page.evaluate("fetch('data:text/plain,probe').then(()=>false,()=>true)")
        assert not [url for url in requests if not url.startswith(ORIGIN + '/') and not url.startswith('data:')]
        assert downloads == popups == errors == dialogs == []
        result = {"passed": True, "headers": headers, "externalRequests": [], "permissionCalls": [], "downloads": [], "popups": [], "dialogs": [], "javascriptErrors": [], "inlineScriptBlocked": True, "fetchBlocked": True, "engine": "Chromium; not Safari", "transport": "loopback HTTP; public HTTPS pending"}
        (ROOT / '.tools/safari-security-result.json').write_text(json.dumps(result, indent=2))
        print(json.dumps(result, indent=2))
        browser.close()
finally:
    server.terminate()
    server.wait(timeout=10)
